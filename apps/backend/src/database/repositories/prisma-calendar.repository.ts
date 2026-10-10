import { Injectable } from '@nestjs/common';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  CalendarEvent as PrismaCalendarEvent,
  CalendarIntegration as PrismaCalendarIntegration,
} from '../../generated/prisma/client';
import { Prisma } from '../../generated/prisma/client';
import { TokenCipher } from '../../infra/crypto';
import { PrismaService } from '../../infra/prisma';
import type {
  CalendarEvent,
  CalendarEventForRead,
  CalendarEventWrite,
  CalendarIntegration,
} from '../entities';
import type {
  CalendarConflictResolution,
  CalendarConflictResolutionResult,
  CalendarConflictSnapshot,
  CalendarBindingSyncClaim,
  CalendarRequestFence,
  CancelledCalendarOccurrence,
  CalendarCredentialRefreshClaim,
  CalendarInboundEventInput,
  CalendarMutationRequest,
  CalendarMutationResult,
  CalendarRetryOperationResult,
  CalendarPrivacyExport,
  CalendarOAuthRequestInput,
  CalendarSyncOperationClaim,
  CalendarSyncOperationalSnapshot,
  CalendarSyncConflictView,
  CalendarSyncStatus,
  CalendarSyncRetentionResult,
  CompleteCalendarSyncOperation,
  ConsumedCalendarOAuthRequest,
  FailCalendarSyncOperation,
  ICalendarRepository,
  SaveGoogleConnectionInput,
  SaveCalendarSyncPageInput,
} from '../interfaces';

const eventSelect = {
  id: true,
  provider: true,
  providerEventId: true,
  title: true,
  description: true,
  location: true,
  startAt: true,
  endAt: true,
  timezone: true,
  allDayStartDate: true,
  allDayEndDate: true,
  recurrence: true,
  recurrenceOverrideFields: true,
  recurringParentProviderEventId: true,
  recurringParentEventId: true,
  recurrenceExceptionKey: true,
  originalStartAt: true,
  originalStartDate: true,
  attendees: true,
  status: true,
  syncState: true,
  revision: true,
  lastSyncedAt: true,
  syncErrorCode: true,
  createdAt: true,
  updatedAt: true,
} as const;

const LOCAL_RECURRENCE_OVERRIDE_FIELDS = [
  'title',
  'description',
  'location',
  'attendees',
  'time',
  'status',
] as const;

type LocalRecurrenceOverrideField =
  (typeof LOCAL_RECURRENCE_OVERRIDE_FIELDS)[number];

type CalendarTemporalFields = Pick<
  CalendarEvent,
  'startAt' | 'endAt' | 'timezone' | 'allDayStartDate' | 'allDayEndDate'
>;

type CalendarTemporalMutation = Partial<CalendarTemporalFields>;

const integrationSelect = {
  id: true,
  provider: true,
  status: true,
  accessTokenExpiresAt: true,
  scope: true,
  calendarId: true,
  googleEmail: true,
  connectionGeneration: true,
  activeBindingId: true,
  updatedAt: true,
} as const;

type EventRow = Pick<PrismaCalendarEvent, keyof typeof eventSelect>;
type IntegrationRow = Pick<
  PrismaCalendarIntegration,
  keyof typeof integrationSelect
>;
type Transaction = Prisma.TransactionClient;
type DatabaseTimedCalendarSyncPageInput = SaveCalendarSyncPageInput & {
  now: Date;
};
const CALENDAR_POLL_INTERVAL_MS = 5 * 60 * 1000;
const MAX_LEGACY_EVENT_CANDIDATES_PER_PAGE = 500;
const FULL_IMPORT_FINALIZATION_BATCH_SIZE = 100;

class CalendarRetryRaceError extends Error {
  constructor() {
    super('Calendar event or operation changed while retry was being queued.');
    this.name = 'CalendarRetryRaceError';
  }
}

class CalendarSyncLeaseLostError extends Error {
  constructor() {
    super('Calendar sync lease expired or changed before its page commit.');
    this.name = 'CalendarSyncLeaseLostError';
  }
}

function event(row: EventRow): CalendarEvent {
  return {
    ...row,
    status: row.status as CalendarEvent['status'],
    syncState: row.syncState as CalendarEvent['syncState'],
  };
}

function temporalMutationData(
  input: Partial<CalendarEventWrite>,
): CalendarTemporalMutation {
  const hasTimedFields =
    input.startAt !== undefined ||
    input.endAt !== undefined ||
    input.timezone !== undefined;

  const hasAllDayFields =
    input.allDayStartDate !== undefined || input.allDayEndDate !== undefined;

  const data: CalendarTemporalMutation = {};

  if (input.startAt !== undefined) data.startAt = input.startAt;
  if (input.endAt !== undefined) data.endAt = input.endAt;
  if (input.timezone !== undefined) data.timezone = input.timezone;
  if (input.allDayStartDate !== undefined)
    data.allDayStartDate = input.allDayStartDate;
  if (input.allDayEndDate !== undefined)
    data.allDayEndDate = input.allDayEndDate;

  if (hasAllDayFields && !hasTimedFields) {
    data.startAt = null;
    data.endAt = null;
  } else if (hasTimedFields && !hasAllDayFields) {
    data.allDayStartDate = null;
    data.allDayEndDate = null;
  }

  return data;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left instanceof Date || right instanceof Date)
    return (
      left instanceof Date &&
      right instanceof Date &&
      left.getTime() === right.getTime()
    );

  if (isUnknownArray(left) || isUnknownArray(right)) {
    if (!isUnknownArray(left) || !isUnknownArray(right)) return false;
    if (left.length !== right.length) return false;

    const sortedLeft = [...left].sort();
    const sortedRight = [...right].sort();

    return sortedLeft.every((value, index) => value === sortedRight[index]);
  }

  return Object.is(left, right);
}

function sameCalendarTime(
  left: CalendarTemporalFields,
  right: CalendarTemporalFields,
): boolean {
  return (
    sameValue(left.startAt, right.startAt) &&
    sameValue(left.endAt, right.endAt) &&
    sameValue(left.timezone, right.timezone) &&
    sameValue(left.allDayStartDate, right.allDayStartDate) &&
    sameValue(left.allDayEndDate, right.allDayEndDate)
  );
}

function inheritedTimeMatches(
  event: CalendarEvent,
  series: CalendarEvent,
): boolean {
  if (
    series.allDayStartDate &&
    series.allDayEndDate &&
    event.originalStartDate
  ) {
    const seriesDuration =
      series.allDayEndDate.getTime() - series.allDayStartDate.getTime();

    return (
      event.startAt === null &&
      event.endAt === null &&
      event.allDayStartDate?.getTime() === event.originalStartDate.getTime() &&
      event.allDayEndDate?.getTime() ===
        event.originalStartDate.getTime() + seriesDuration
    );
  }

  if (series.startAt && series.endAt && event.originalStartAt) {
    const seriesDuration = series.endAt.getTime() - series.startAt.getTime();

    return (
      event.allDayStartDate === null &&
      event.allDayEndDate === null &&
      event.startAt?.getTime() === event.originalStartAt.getTime() &&
      event.endAt?.getTime() ===
        event.originalStartAt.getTime() + seriesDuration &&
      event.timezone === (series.timezone ?? 'UTC')
    );
  }

  return false;
}

function localExceptionOverrideFields(
  current: CalendarEvent,
  series: CalendarEvent,
  input: Partial<CalendarEventWrite>,
): LocalRecurrenceOverrideField[] {
  const fields = new Set<LocalRecurrenceOverrideField>(
    current.recurrenceOverrideFields.filter(
      (field): field is LocalRecurrenceOverrideField =>
        LOCAL_RECURRENCE_OVERRIDE_FIELDS.includes(
          field as LocalRecurrenceOverrideField,
        ),
    ),
  );

  const compareField = <
    K extends 'title' | 'description' | 'location' | 'attendees',
  >(
    field: K,
  ) => {
    const nextValue = input[field];
    if (nextValue === undefined) return;
    if (sameValue(nextValue, series[field])) fields.delete(field);
    else fields.add(field);
  };

  compareField('title');
  compareField('description');
  compareField('location');
  compareField('attendees');

  const timeWasWritten =
    input.startAt !== undefined ||
    input.endAt !== undefined ||
    input.timezone !== undefined ||
    input.allDayStartDate !== undefined ||
    input.allDayEndDate !== undefined;

  if (timeWasWritten) {
    const nextTime = { ...current, ...temporalMutationData(input) };
    if (
      inheritedTimeMatches(nextTime, series) ||
      sameCalendarTime(nextTime, current)
    )
      fields.delete('time');
    else fields.add('time');
  }

  if (input.status !== undefined) {
    if (input.status === series.status) fields.delete('status');
    else fields.add('status');
  }

  return LOCAL_RECURRENCE_OVERRIDE_FIELDS.filter((field) => fields.has(field));
}

function projectLocalException(
  exception: CalendarEvent,
  series: CalendarEvent,
  occurrence: CalendarTemporalFields,
): CalendarEvent {
  const overrides = new Set(exception.recurrenceOverrideFields);
  const inheritsTime = !overrides.has('time');

  return {
    ...exception,
    title: overrides.has('title') ? exception.title : series.title,
    description: overrides.has('description')
      ? exception.description
      : series.description,
    location: overrides.has('location') ? exception.location : series.location,
    attendees: overrides.has('attendees')
      ? exception.attendees
      : series.attendees,
    status: overrides.has('status') ? exception.status : series.status,
    ...(inheritsTime ? occurrence : {}),
  };
}

function integration(row: IntegrationRow): CalendarIntegration {
  return row;
}

function operationKey(userId: string, requestKey: string): string {
  const fingerprint = createHash('sha256')
    .update(userId)
    .update(':')
    .update(requestKey)
    .digest('hex');

  return `calendar:${fingerprint}`;
}

function eventPayload(row: EventRow): Prisma.InputJsonObject {
  return {
    id: row.id,
    provider: row.provider,
    providerEventId: row.providerEventId,
    title: row.title,
    description: row.description,
    location: row.location,
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    timezone: row.timezone,
    allDayStartDate: row.allDayStartDate?.toISOString() ?? null,
    allDayEndDate: row.allDayEndDate?.toISOString() ?? null,
    recurrence: row.recurrence,
    recurringParentProviderEventId: row.recurringParentProviderEventId,
    originalStartAt: row.originalStartAt?.toISOString() ?? null,
    originalStartDate: row.originalStartDate?.toISOString() ?? null,
    attendees: row.attendees,
    status: row.status,
    revision: row.revision,
  };
}

function inputJsonObject(value: unknown): Prisma.InputJsonObject {
  const serialized = JSON.stringify(value);
  if (serialized === undefined)
    throw new Error('Calendar sync data could not be serialized.');
  const parsed: unknown = JSON.parse(serialized);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Calendar sync data must be a JSON object.');

  return parsed;
}

function operationKind(value: string): 'create' | 'update' | 'delete' {
  if (value === 'create' || value === 'update' || value === 'delete')
    return value;

  throw new Error(`Unsupported calendar sync operation kind: ${value}`);
}

const SYNCED_EVENT_FIELDS = [
  'title',
  'description',
  'location',
  'startAt',
  'endAt',
  'timezone',
  'allDayStartDate',
  'allDayEndDate',
  'recurrence',
  'attendees',
  'status',
] as const;

function commonSnapshot(value: unknown): Prisma.InputJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Calendar sync common snapshot must be an object.');
  const source = value as Record<string, unknown>;
  const common = Object.fromEntries(
    SYNCED_EVENT_FIELDS.map((field) => [field, source[field] ?? null]),
  );

  return inputJsonObject(common);
}

function snapshotRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Calendar sync snapshot must be an object.');

  return value as Record<string, unknown>;
}

function sameSnapshotValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

const CALENDAR_TIME_FIELDS = [
  'startAt',
  'endAt',
  'timezone',
  'allDayStartDate',
  'allDayEndDate',
  'recurrence',
] as const;

function snapshotFieldValue(field: string, value: unknown): unknown {
  if ((field === 'description' || field === 'location') && value === '')
    return null;

  if (field === 'recurrence' || field === 'attendees') {
    if (value === null || value === undefined) return [];
    if (
      !Array.isArray(value) ||
      !value.every((item): item is string => typeof item === 'string')
    )
      throw new Error(
        'Calendar sync snapshot contains an invalid string list.',
      );

    return [...value].sort();
  }

  return value ?? null;
}

function sameSnapshotField(
  field: string,
  left: unknown,
  right: unknown,
): boolean {
  return sameSnapshotValue(
    snapshotFieldValue(field, left),
    snapshotFieldValue(field, right),
  );
}

function snapshotConflictingGroups(
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
): string[] {
  const localChanged = snapshotChangedFields(base, local);
  const remoteChanged = snapshotChangedFields(base, remote);
  if (
    local.status === 'cancelled' &&
    base.status !== 'cancelled' &&
    remoteChanged.length > 0
  )
    return ['status'];
  const conflicts = ['title', 'description', 'location'].filter(
    (field) =>
      localChanged.includes(field) &&
      remoteChanged.includes(field) &&
      !sameSnapshotField(field, local[field], remote[field]),
  );

  if (
    CALENDAR_TIME_FIELDS.some((field) => localChanged.includes(field)) &&
    CALENDAR_TIME_FIELDS.some((field) => remoteChanged.includes(field)) &&
    CALENDAR_TIME_FIELDS.some(
      (field) => !sameSnapshotField(field, local[field], remote[field]),
    )
  )
    conflicts.push('time');
  conflicts.push(
    ...['attendees', 'status'].filter(
      (field) =>
        localChanged.includes(field) &&
        remoteChanged.includes(field) &&
        !sameSnapshotField(field, local[field], remote[field]),
    ),
  );

  return conflicts;
}

function snapshotChangedFields(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): string[] {
  return SYNCED_EVENT_FIELDS.filter(
    (field) => !sameSnapshotField(field, left[field], right[field]),
  );
}

function eventDataFromSnapshot(
  snapshot: Record<string, unknown>,
  inbound: CalendarInboundEventInput,
): Prisma.CalendarEventUncheckedUpdateInput {
  const title = snapshot.title;
  if (typeof title !== 'string')
    throw new Error('Calendar sync snapshot is missing a valid title.');

  const status = snapshot.status;
  if (
    status !== 'confirmed' &&
    status !== 'tentative' &&
    status !== 'cancelled'
  )
    throw new Error('Calendar sync snapshot contains an invalid event status.');

  const date = (value: unknown): Date | null => {
    if (typeof value !== 'string') return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
      throw new Error('Calendar sync snapshot contains an invalid date.');

    return parsed;
  };

  return {
    title,
    description:
      typeof snapshot.description === 'string' ? snapshot.description : null,
    location: typeof snapshot.location === 'string' ? snapshot.location : null,
    startAt: date(snapshot.startAt),
    endAt: date(snapshot.endAt),
    timezone: typeof snapshot.timezone === 'string' ? snapshot.timezone : null,
    allDayStartDate: date(snapshot.allDayStartDate),
    allDayEndDate: date(snapshot.allDayEndDate),
    recurrence: Array.isArray(snapshot.recurrence)
      ? snapshot.recurrence.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
    attendees: Array.isArray(snapshot.attendees)
      ? snapshot.attendees.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
    status,
    recurringParentProviderEventId: inbound.recurringParentProviderEventId,
    originalStartAt: inbound.originalStartAt,
    originalStartDate: inbound.originalStartDate,
  };
}

function conflictSnapshot(value: unknown): CalendarConflictSnapshot {
  const source = snapshotRecord(value);

  const nullableString = (field: string): string | null => {
    const current = source[field];
    if (current === null) return null;
    if (typeof current !== 'string')
      throw new Error(`Calendar conflict snapshot has an invalid ${field}.`);

    return current;
  };

  const stringArray = (field: string): string[] => {
    const current = source[field];
    if (
      !Array.isArray(current) ||
      !current.every((item) => typeof item === 'string')
    )
      throw new Error(`Calendar conflict snapshot has an invalid ${field}.`);

    return current;
  };

  const status = source.status;
  if (
    status !== 'confirmed' &&
    status !== 'tentative' &&
    status !== 'cancelled'
  )
    throw new Error('Calendar conflict snapshot has an invalid status.');

  return {
    title: nullableString('title'),
    description: nullableString('description'),
    location: nullableString('location'),
    startAt: nullableString('startAt'),
    endAt: nullableString('endAt'),
    timezone: nullableString('timezone'),
    allDayStartDate: nullableString('allDayStartDate'),
    allDayEndDate: nullableString('allDayEndDate'),
    recurrence: stringArray('recurrence'),
    attendees: stringArray('attendees'),
    status,
  };
}

function conflictSnapshotFromRemote(
  value: unknown,
): CalendarConflictSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const common = (value as Record<string, unknown>).common;
  if (!common || typeof common !== 'object' || Array.isArray(common))
    return null;

  return conflictSnapshot(common);
}

function conflictRemoteParts(value: unknown): {
  resource: Record<string, unknown>;
  common: Record<string, unknown>;
} {
  const wrapper = snapshotRecord(value);
  const resource = snapshotRecord(wrapper.resource);
  const common = snapshotRecord(wrapper.common);

  return { resource, common };
}

function conflictRemoteSnapshot(
  resource: unknown,
  common: unknown,
): Prisma.InputJsonObject {
  return inputJsonObject({ resource, common: commonSnapshot(common) });
}

@Injectable()
export class PrismaCalendarRepository implements ICalendarRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenCipher: TokenCipher,
  ) {}

  private async databaseNow(
    client: Transaction | PrismaService = this.prisma,
  ): Promise<Date> {
    const rows = await client.$queryRaw<Array<{ now: Date }>>(
      Prisma.sql`SELECT clock_timestamp() AS "now"`,
    );

    const now = rows[0]?.now;
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
      throw new Error('Database clock query returned an invalid timestamp.');

    return now;
  }

  private leaseExpiresAt(now: Date, leaseDurationMs: number): Date {
    if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs <= 0)
      throw new Error('Calendar lease duration must be a positive integer.');

    return new Date(now.getTime() + leaseDurationMs);
  }

  private retryAt(now: Date, delayMs: number): Date {
    if (!Number.isSafeInteger(delayMs) || delayMs < 0)
      throw new Error('Calendar retry delay must be a non-negative integer.');

    return new Date(now.getTime() + delayMs);
  }

  async status(userId: string): Promise<CalendarIntegration | null> {
    const row = await this.prisma.calendarIntegration.findUnique({
      where: { userId_provider: { userId, provider: 'google' } },
      select: integrationSelect,
    });

    return row ? integration(row) : null;
  }

  async operationalMetricsSnapshot(): Promise<CalendarSyncOperationalSnapshot> {
    const rows = await this.prisma.$queryRaw<
      CalendarSyncOperationalSnapshot[]
    >(Prisma.sql`
      WITH clock AS (
        SELECT clock_timestamp() AS "now"
      ), active_bindings AS (
        SELECT binding."id", binding."lastSyncedAt", binding."createdAt"
        FROM "calendar_binding" AS binding
        JOIN "calendar_integration" AS integration
          ON integration."id" = binding."integrationId"
        WHERE integration."status" = 'connected'
          AND integration."activeBindingId" = binding."id"
          AND binding."state" IN ('active', 'initializing')
      ), active_operations AS (
        SELECT operation."state", operation."createdAt"
        FROM "calendar_sync_operation" AS operation
        JOIN active_bindings AS binding
          ON binding."id" = operation."bindingId"
        WHERE operation."state" IN ('pending', 'processing')
      )
      SELECT
        (SELECT COUNT(*) FILTER (WHERE "state" = 'pending')::double precision
         FROM active_operations) AS "pendingOperationCount",
        (SELECT COUNT(*) FILTER (WHERE "state" = 'processing')::double precision
         FROM active_operations) AS "processingOperationCount",
        COALESCE((
          SELECT EXTRACT(EPOCH FROM (clock."now" - MIN("createdAt"))) * 1000
          FROM active_operations
        ), 0)::double precision AS "oldestOperationAgeMs",
        (SELECT COUNT(*)::double precision FROM active_bindings)
          AS "activeBindingCount",
        (SELECT COUNT(*) FILTER (WHERE "lastSyncedAt" IS NULL)::double precision
         FROM active_bindings) AS "neverSyncedBindingCount",
        COALESCE((
          SELECT EXTRACT(EPOCH FROM (clock."now" - MIN("createdAt"))) * 1000
          FROM active_bindings
          WHERE "lastSyncedAt" IS NULL
        ), 0)::double precision AS "oldestNeverSyncedBindingAgeMs",
        COALESCE((
          SELECT EXTRACT(EPOCH FROM (clock."now" - MIN("lastSyncedAt"))) * 1000
          FROM active_bindings
          WHERE "lastSyncedAt" IS NOT NULL
        ), 0)::double precision AS "oldestPullAgeMs",
        (
          SELECT COUNT(*)::double precision
          FROM "calendar_watch_channel" AS watch
          JOIN active_bindings AS binding ON binding."id" = watch."bindingId"
          WHERE watch."state" = 'active'
            AND watch."stoppedAt" IS NULL
            AND watch."expiresAt" > clock."now"
            AND watch."expiresAt" <= clock."now" + INTERVAL '24 hours'
        ) AS "expiringWatchCount",
        (
          SELECT COUNT(*)::double precision
          FROM "calendar_watch_channel" AS watch
          WHERE watch."cleanupRequestedAt" IS NOT NULL
            AND watch."stoppedAt" IS NULL
            AND (watch."expiresAt" IS NULL OR watch."expiresAt" > clock."now")
        ) AS "pendingWatchCleanupCount",
        COALESCE((
          SELECT EXTRACT(EPOCH FROM (clock."now" - MIN(watch."cleanupRequestedAt"))) * 1000
          FROM "calendar_watch_channel" AS watch
          WHERE watch."cleanupRequestedAt" IS NOT NULL
            AND watch."stoppedAt" IS NULL
            AND (watch."expiresAt" IS NULL OR watch."expiresAt" > clock."now")
        ), 0)::double precision AS "oldestWatchCleanupAgeMs"
      FROM clock
    `);

    const snapshot = rows[0];

    if (!snapshot)
      throw new Error('Calendar operational metrics query returned no row.');

    for (const [name, value] of Object.entries(snapshot)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
        throw new Error(
          `Calendar operational metrics query returned an invalid ${name}.`,
        );
    }

    return snapshot;
  }

  async syncStatus(userId: string): Promise<CalendarSyncStatus | null> {
    const row = await this.prisma.calendarIntegration.findUnique({
      where: { userId_provider: { userId, provider: 'google' } },
      select: {
        status: true,
        googleEmail: true,
        calendarId: true,
        activeBinding: {
          select: {
            id: true,
            calendarId: true,
            calendarName: true,
            state: true,
            lastSyncedAt: true,
            lastErrorCode: true,
            watchChannels: {
              where: { state: 'active', stoppedAt: null },
              orderBy: { expiresAt: 'desc' },
              take: 1,
              select: { expiresAt: true },
            },
          },
        },
      },
    });

    if (!row) return null;
    const binding = row.activeBinding;
    const [pendingOperationCount, conflictRows] = binding
      ? await Promise.all([
          this.prisma.calendarSyncOperation.count({
            where: {
              bindingId: binding.id,
              state: { in: ['pending', 'processing'] },
            },
          }),
          this.prisma.calendarSyncConflict.findMany({
            where: { bindingId: binding.id, state: 'open' },
            select: { eventLinkId: true },
          }),
        ])
      : [0, [] as Array<{ eventLinkId: string }>];

    const openConflictCount = new Set(
      conflictRows.map((row) => row.eventLinkId),
    ).size;

    return {
      connectionStatus: row.status,
      googleEmail: row.googleEmail,
      calendarId: binding?.calendarId ?? row.calendarId,
      calendarName: binding?.calendarName ?? null,
      bindingState: binding?.state ?? null,
      lastSyncedAt: binding?.lastSyncedAt ?? null,
      lastErrorCode:
        binding?.lastErrorCode ??
        (row.status === 'reconnect_required' ? 'reconnect_required' : null),
      pendingOperationCount,
      openConflictCount,
      watchExpiresAt: binding?.watchChannels[0]?.expiresAt ?? null,
    };
  }

  async privacyExport(userId: string): Promise<CalendarPrivacyExport> {
    const [connection, events, conflicts] = await Promise.all([
      this.prisma.calendarIntegration.findUnique({
        where: { userId_provider: { userId, provider: 'google' } },
        select: {
          status: true,
          googleEmail: true,
          calendarId: true,
          scope: true,
          updatedAt: true,
        },
      }),
      this.prisma.calendarEvent.findMany({
        where: { userId },
        select: eventSelect,
        orderBy: [
          { startAt: 'asc' },
          { allDayStartDate: 'asc' },
          { id: 'asc' },
        ],
      }),
      this.prisma.calendarSyncConflict.findMany({
        where: { binding: { integration: { userId } } },
        select: {
          id: true,
          baseSnapshot: true,
          localSnapshot: true,
          remoteSnapshot: true,
          conflictingFields: true,
          state: true,
          resolution: true,
          createdAt: true,
          resolvedAt: true,
          eventLink: {
            select: {
              googleEventId: true,
              calendarEvent: { select: { id: true, title: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      connection,
      events: events.map(event),
      conflicts: conflicts.map((conflict) => ({
        id: conflict.id,
        eventId: conflict.eventLink.calendarEvent?.id ?? null,
        eventTitle: conflict.eventLink.calendarEvent?.title ?? null,
        googleEventId: conflict.eventLink.googleEventId,
        baseSnapshot: conflict.baseSnapshot,
        localSnapshot: conflict.localSnapshot,
        remoteSnapshot: conflict.remoteSnapshot,
        conflictingFields: conflict.conflictingFields,
        state: conflict.state,
        resolution: conflict.resolution,
        createdAt: conflict.createdAt,
        resolvedAt: conflict.resolvedAt,
      })),
    };
  }

  async listOpenConflicts(userId: string): Promise<CalendarSyncConflictView[]> {
    const rows = await this.prisma.calendarSyncConflict.findMany({
      where: { state: 'open', binding: { integration: { userId } } },
      include: {
        eventLink: {
          include: {
            calendarEvent: { select: eventSelect },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });

    const seenLinks = new Set<string>();
    const conflicts: CalendarSyncConflictView[] = [];

    for (const row of rows) {
      const link = row.eventLink;
      const current = link.calendarEvent;
      if (!current || seenLinks.has(link.id)) continue;
      seenLinks.add(link.id);

      const remote = conflictSnapshotFromRemote(row.remoteSnapshot);
      conflicts.push({
        id: row.id,
        eventId: current.id,
        title: current.title,
        localRevision: current.revision,
        remoteEtag: link.etag,
        fields: row.conflictingFields,
        local: conflictSnapshot(commonSnapshot(eventPayload(current))),
        remote,
        remoteDeleted:
          link.tombstoneAt !== null || remote?.status === 'cancelled',
        createdAt: row.createdAt,
      });
    }

    return conflicts;
  }

  async resolveConflict(
    userId: string,
    conflictId: string,
    resolution: CalendarConflictResolution,
    expectedLocalRevision: number,
    expectedRemoteEtag: string | null,
    request: CalendarMutationRequest,
  ): Promise<CalendarConflictResolutionResult> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.lockUser(tx, userId))) return { status: 'missing' };

      const conflict = await tx.calendarSyncConflict.findFirst({
        where: {
          id: conflictId,
          state: 'open',
          binding: { integration: { userId } },
        },
        include: {
          eventLink: {
            include: {
              calendarEvent: { select: eventSelect },
              binding: {
                include: {
                  integration: {
                    select: {
                      status: true,
                      activeBindingId: true,
                      connectionGeneration: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!conflict) return { status: 'missing' };
      const link = conflict.eventLink;
      const current = link.calendarEvent;
      if (!current) return { status: 'missing' };
      if (
        current.revision !== expectedLocalRevision ||
        conflict.localRevision !== expectedLocalRevision ||
        link.etag !== expectedRemoteEtag
      )
        return { status: 'stale' };

      const binding = link.binding;
      const integrationRow = binding.integration;
      if (integrationRow.status === 'reconnect_required')
        return { status: 'reconnect_required' };
      if (
        integrationRow.status !== 'connected' ||
        integrationRow.activeBindingId !== binding.id ||
        !['active', 'initializing'].includes(binding.state)
      )
        return { status: 'read_only' };

      const processing = await tx.calendarSyncOperation.count({
        where: {
          bindingId: binding.id,
          calendarEventId: current.id,
          state: 'processing',
        },
      });

      if (processing > 0) return { status: 'busy' };

      const remote = conflictSnapshotFromRemote(conflict.remoteSnapshot);
      if (resolution === 'use_google' && !remote) return { status: 'stale' };
      const remoteParts = remote
        ? conflictRemoteParts(conflict.remoteSnapshot)
        : { resource: {}, common: {} };

      const now = new Date();
      const eventLinkId = link.id;
      await tx.calendarSyncOperation.updateMany({
        where: {
          bindingId: binding.id,
          calendarEventId: current.id,
          state: { in: ['pending', 'paused', 'conflict', 'failed'] },
        },
        data: {
          state: 'failed',
          claimedUntil: null,
          claimToken: null,
          lastErrorCode: 'conflict_resolved',
          lastErrorMessage: 'conflict_resolved',
        },
      });

      let updated: CalendarEvent;
      let operationId: string | null = null;

      if (resolution === 'use_google') {
        if (!remote) return { status: 'stale' };
        const remoteDeleted =
          remote.status === 'cancelled' ||
          remoteParts.resource.deleted === true;

        const revision = current.revision + 1;
        const remoteCommon = commonSnapshot(remote);

        const inbound: CalendarInboundEventInput = {
          googleEventId: link.googleEventId,
          etag: link.etag,
          rawSnapshot: remoteParts.resource,
          commonSnapshot: remoteCommon,
          event: null,
          status: remoteDeleted ? 'cancelled' : remote.status,
          recurringParentProviderEventId: link.recurringParentProviderEventId,
          originalStartAt: link.originalStartAt,
          originalStartDate: link.originalStartDate,
        };

        const data = remoteDeleted
          ? {
              status: 'cancelled' as const,
              syncState: 'synced',
              syncErrorCode: null,
              revision,
              lastSyncedAt: now,
            }
          : {
              ...eventDataFromSnapshot(snapshotRecord(remoteCommon), inbound),
              provider: 'google',
              providerEventId: link.googleEventId,
              syncState: 'synced',
              syncErrorCode: null,
              revision,
              lastSyncedAt: now,
            };

        updated = event(
          await tx.calendarEvent.update({
            where: { id: current.id },
            data,
            select: eventSelect,
          }),
        );
        await tx.calendarEventLink.update({
          where: { id: link.id },
          data: {
            commonSnapshot: remoteCommon,
            syncedRevision: revision,
            tombstoneAt: remoteDeleted ? now : null,
          },
        });
      } else {
        const remoteDeleted =
          remote?.status === 'cancelled' ||
          remoteParts.resource.deleted === true ||
          (!remote && link.tombstoneAt !== null);

        const eventStatus = current.status as CalendarEvent['status'];
        const needsWrite = !(remoteDeleted && eventStatus === 'cancelled');
        const nextRevision = current.revision + (needsWrite ? 1 : 0);

        updated = event(
          await tx.calendarEvent.update({
            where: { id: current.id },
            data: {
              revision: nextRevision,
              syncState: needsWrite ? 'pending' : 'synced',
              syncErrorCode: null,
              ...(needsWrite ? {} : { lastSyncedAt: now }),
            },
            select: eventSelect,
          }),
        );

        if (needsWrite) {
          const kind = remoteDeleted
            ? 'create'
            : eventStatus === 'cancelled'
              ? 'delete'
              : 'update';

          operationId = await this.createOperation(
            tx,
            userId,
            updated,
            kind,
            {
              bindingId: binding.id,
              connectionGeneration: integrationRow.connectionGeneration,
            },
            request,
            remote
              ? commonSnapshot(remote)
              : link.commonSnapshot
                ? inputJsonObject(link.commonSnapshot)
                : undefined,
          );
        } else {
          await tx.calendarEventLink.update({
            where: { id: link.id },
            data: {
              commonSnapshot: commonSnapshot(eventPayload(updated)),
              syncedRevision: updated.revision,
              tombstoneAt: now,
            },
          });
        }
      }

      await tx.calendarSyncConflict.updateMany({
        where: { eventLinkId, state: 'open' },
        data: {
          state: 'resolved',
          resolution,
          resolvedAt: now,
        },
      });

      return { status: 'saved', event: updated, operationId };
    });
  }

  integrationCredentials(userId: string) {
    return this.prisma.calendarIntegration
      .findUnique({
        where: {
          userId_provider: { userId, provider: 'google' },
        },
        select: {
          accessToken: true,
          refreshToken: true,
          accessTokenExpiresAt: true,
          calendarId: true,
          googleSubject: true,
          activeBindingId: true,
          credentialGeneration: true,
        },
      })
      .then((row) =>
        row
          ? {
              accessToken: row.accessToken
                ? this.tokenCipher.decrypt(row.accessToken)
                : row.accessToken,
              refreshToken: row.refreshToken
                ? this.tokenCipher.decrypt(row.refreshToken)
                : row.refreshToken,
              expiresAt: row.accessTokenExpiresAt,
              calendarId: row.calendarId,
              googleSubject: row.googleSubject,
              activeBindingId: row.activeBindingId,
              credentialGeneration: row.credentialGeneration,
            }
          : null,
      );
  }

  async saveIntegration(
    userId: string,
    input: {
      accessToken: string;
      refreshToken?: string | null;
      expiresAt: Date;
      scope?: string | null;
    },
  ): Promise<void> {
    await this.prisma.calendarIntegration.upsert({
      where: { userId_provider: { userId, provider: 'google' } },
      create: {
        userId,
        provider: 'google',
        status: 'connected',
        accessToken: this.tokenCipher.encrypt(input.accessToken),
        refreshToken:
          input.refreshToken != null
            ? this.tokenCipher.encrypt(input.refreshToken)
            : input.refreshToken,
        accessTokenExpiresAt: input.expiresAt,
        scope: input.scope,
      },
      update: {
        status: 'connected',
        accessToken: this.tokenCipher.encrypt(input.accessToken),
        ...(input.refreshToken != null
          ? { refreshToken: this.tokenCipher.encrypt(input.refreshToken) }
          : {}),
        accessTokenExpiresAt: input.expiresAt,
        scope: input.scope,
      },
    });
  }

  async updateAccessToken(
    userId: string,
    accessToken: string,
    expiresAt: Date,
  ): Promise<void> {
    const result = await this.prisma.calendarIntegration.updateMany({
      where: { userId, provider: 'google', status: 'disconnecting' },
      data: {
        accessToken: this.tokenCipher.encrypt(accessToken),
        accessTokenExpiresAt: expiresAt,
      },
    });

    if (result.count !== 1)
      throw new Error(
        'Google Calendar disconnect changed before its watch cleanup token could be saved.',
      );
  }

  async beginDisconnect(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.lockUser(tx, userId)))
        return { connectionStatus: 'disconnected' as const, channels: [] };

      const integration = await tx.calendarIntegration.findUnique({
        where: { userId_provider: { userId, provider: 'google' } },
        select: {
          id: true,
          status: true,
          accessToken: true,
          refreshToken: true,
          activeBindingId: true,
        },
      });

      if (!integration)
        return { connectionStatus: 'disconnected' as const, channels: [] };

      const hasCleanupState =
        Boolean(integration.activeBindingId) ||
        Boolean(integration.accessToken) ||
        Boolean(integration.refreshToken);

      if (integration.status === 'disconnected' && !hasCleanupState)
        return { connectionStatus: 'disconnected' as const, channels: [] };

      const now = await this.databaseNow(tx);
      const alreadyDisconnecting = integration.status === 'disconnecting';
      const channels = integration.activeBindingId
        ? await tx.calendarWatchChannel.findMany({
            where: {
              bindingId: integration.activeBindingId,
              state: { in: ['active', 'registering', 'cleanup_pending'] },
              stoppedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { channelId: true, resourceId: true },
          })
        : [];

      if (!alreadyDisconnecting) {
        await tx.calendarIntegration.update({
          where: { id: integration.id },
          data: {
            status: 'disconnecting',
            connectionGeneration: { increment: 1 },
          },
        });
        await tx.calendarOAuthRequest.updateMany({
          where: { userId, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now },
        });

        if (integration.activeBindingId)
          await this.fenceCalendarBindingForDisconnect(
            tx,
            [integration.activeBindingId],
            now,
          );
      }

      return { connectionStatus: 'disconnecting' as const, channels };
    });
  }

  private async fenceCalendarBindingForDisconnect(
    tx: Transaction,
    bindingIds: string[],
    now: Date,
  ): Promise<void> {
    if (bindingIds.length === 0) return;

    await tx.calendarBinding.updateMany({
      where: { id: { in: bindingIds }, state: { not: 'disconnected' } },
      data: {
        state: 'disconnected',
        leaseOwner: null,
        leaseExpiresAt: null,
        leaseEpoch: { increment: 1 },
      },
    });
    await tx.calendarSyncOperation.updateMany({
      where: {
        bindingId: { in: bindingIds },
        state: { notIn: ['completed', 'cancelled'] },
      },
      data: { state: 'paused' },
    });
    await tx.calendarEvent.updateMany({
      where: { providerLink: { is: { bindingId: { in: bindingIds } } } },
      data: { syncState: 'reconnect_required' },
    });
    await tx.calendarWatchChannel.updateMany({
      where: {
        bindingId: { in: bindingIds },
        stoppedAt: null,
        cleanupRequestedAt: null,
      },
      data: { state: 'cleanup_pending', cleanupRequestedAt: now },
    });
  }

  async disconnect(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const now = await this.databaseNow(tx);
      const integrations = await tx.calendarIntegration.findMany({
        where: { userId, provider: 'google' },
        select: { id: true, activeBindingId: true, status: true },
      });

      const bindingIds = integrations.flatMap(({ activeBindingId }) =>
        activeBindingId ? [activeBindingId] : [],
      );

      const shouldAdvanceGeneration = integrations.some(
        ({ status }) => status !== 'disconnecting' && status !== 'disconnected',
      );

      await tx.calendarIntegration.updateMany({
        where: { userId, provider: 'google' },
        data: {
          status: 'disconnected',
          accessToken: null,
          refreshToken: null,
          accessTokenExpiresAt: null,
          activeBindingId: null,
          ...(shouldAdvanceGeneration
            ? { connectionGeneration: { increment: 1 } }
            : {}),
        },
      });
      if (!bindingIds.length) return;

      await this.fenceCalendarBindingForDisconnect(tx, bindingIds, now);
    });
  }

  async list(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<CalendarEventForRead[]> {
    const fromDate = new Date(
      Date.UTC(
        from.getUTCFullYear(),
        from.getUTCMonth(),
        from.getUTCDate() - 1,
      ),
    );

    const toDate = new Date(
      Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() + 1),
    );

    const rows = await this.prisma.calendarEvent.findMany({
      where: {
        userId,
        OR: [
          {
            status: { in: ['confirmed', 'tentative'] },
            OR: [
              {
                recurrence: { isEmpty: false },
                recurringParentProviderEventId: null,
                recurringParentEventId: null,
              },
              {
                startAt: { not: null, lt: to },
                endAt: { not: null, gt: from },
              },
              {
                allDayStartDate: { not: null, lt: toDate },
                allDayEndDate: { not: null, gt: fromDate },
              },
              {
                recurringParentProviderEventId: { not: null },
                originalStartAt: { gte: from, lt: to },
              },
              {
                recurringParentProviderEventId: { not: null },
                originalStartDate: { gte: fromDate, lt: toDate },
              },
            ],
          },
          {
            recurringParentEventId: { not: null },
            recurrenceExceptionKey: { not: null },
            OR: [
              {
                startAt: { not: null, lt: to },
                endAt: { not: null, gt: from },
              },
              {
                allDayStartDate: { not: null, lt: toDate },
                allDayEndDate: { not: null, gt: fromDate },
              },
              { originalStartAt: { gte: from, lt: to } },
              { originalStartDate: { gte: fromDate, lt: toDate } },
            ],
          },
        ],
      },
      select: { ...eventSelect, providerLink: { select: { bindingId: true } } },
      take: 5001,
    });

    return rows
      .map(({ providerLink, ...row }) => ({
        ...event(row),
        providerBindingId: providerLink?.bindingId ?? null,
      }))
      .sort((left, right) => {
        const leftStart = left.startAt ?? left.allDayStartDate;
        const rightStart = right.startAt ?? right.allDayStartDate;

        return (leftStart?.getTime() ?? 0) - (rightStart?.getTime() ?? 0);
      });
  }

  async listCancelledRecurringInstances(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<CancelledCalendarOccurrence[]> {
    const fromDate = new Date(
      Date.UTC(
        from.getUTCFullYear(),
        from.getUTCMonth(),
        from.getUTCDate() - 1,
      ),
    );

    const toDate = new Date(
      Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() + 1),
    );

    const links = await this.prisma.calendarEventLink.findMany({
      where: {
        tombstoneAt: { not: null },
        recurringParentProviderEventId: { not: null },
        binding: { integration: { userId } },
        OR: [
          { originalStartAt: { gte: from, lt: to } },
          { originalStartDate: { gte: fromDate, lt: toDate } },
        ],
      },
      select: {
        bindingId: true,
        recurringParentProviderEventId: true,
        originalStartAt: true,
        originalStartDate: true,
      },
      take: 5001,
    });

    return links.flatMap((link) =>
      link.recurringParentProviderEventId
        ? [
            {
              bindingId: link.bindingId,
              recurringParentProviderEventId:
                link.recurringParentProviderEventId,
              originalStartAt: link.originalStartAt,
              originalStartDate: link.originalStartDate,
            },
          ]
        : [],
    );
  }

  async findById(userId: string, id: string): Promise<CalendarEvent | null> {
    const row = await this.prisma.calendarEvent.findFirst({
      where: { id, userId },
      select: eventSelect,
    });

    return row ? event(row) : null;
  }

  async materializeGoogleOccurrence(input: {
    userId: string;
    seriesEventId: string;
    bindingId: string;
    calendarId: string;
    connectionGeneration: number;
    inbound: CalendarInboundEventInput;
  }): Promise<CalendarEvent | null> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.lockUser(tx, input.userId))) return null;
      const now = await this.databaseNow(tx);

      const integration = await tx.calendarIntegration.findUnique({
        where: {
          userId_provider: { userId: input.userId, provider: 'google' },
        },
        select: {
          status: true,
          connectionGeneration: true,
          activeBindingId: true,
          activeBinding: {
            select: { id: true, calendarId: true, state: true },
          },
        },
      });

      const binding = integration?.activeBinding;
      if (
        integration?.status !== 'connected' ||
        integration.connectionGeneration !== input.connectionGeneration ||
        !integration.activeBindingId ||
        !binding ||
        binding.id !== integration.activeBindingId ||
        binding.id !== input.bindingId ||
        binding.calendarId !== input.calendarId ||
        !['active', 'initializing'].includes(binding.state)
      )
        return null;

      const master = await tx.calendarEvent.findFirst({
        where: {
          id: input.seriesEventId,
          userId: input.userId,
          provider: 'google',
          recurrence: { isEmpty: false },
          recurringParentProviderEventId: null,
        },
        select: { ...eventSelect, providerLink: { select: { id: true } } },
      });

      const inbound = input.inbound;
      const hasOriginalStart =
        (inbound.originalStartAt !== null) !==
        (inbound.originalStartDate !== null);

      if (
        !master?.providerEventId ||
        inbound.recurringParentProviderEventId !== master.providerEventId ||
        inbound.googleEventId === master.providerEventId ||
        inbound.status === 'cancelled' ||
        !inbound.event ||
        !hasOriginalStart
      )
        return null;

      const masterLink = await tx.calendarEventLink.findFirst({
        where: {
          bindingId: binding.id,
          googleEventId: master.providerEventId,
          calendarEventId: master.id,
          tombstoneAt: null,
        },
        select: { id: true },
      });

      if (!masterLink) return null;

      const existingLink = await tx.calendarEventLink.findUnique({
        where: {
          bindingId_googleEventId: {
            bindingId: binding.id,
            googleEventId: inbound.googleEventId,
          },
        },
        select: {
          calendarEventId: true,
          tombstoneAt: true,
          recurringParentProviderEventId: true,
          originalStartAt: true,
          originalStartDate: true,
        },
      });

      if (existingLink) {
        const sameOriginalStart =
          existingLink.originalStartAt?.getTime() ===
            inbound.originalStartAt?.getTime() &&
          existingLink.originalStartDate?.getTime() ===
            inbound.originalStartDate?.getTime();

        if (
          existingLink.recurringParentProviderEventId !==
            master.providerEventId ||
          !sameOriginalStart ||
          !existingLink.calendarEventId ||
          existingLink.tombstoneAt
        )
          return null;

        const existingEvent = await tx.calendarEvent.findFirst({
          where: { id: existingLink.calendarEventId, userId: input.userId },
          select: eventSelect,
        });

        return existingEvent && existingEvent.status !== 'cancelled'
          ? event(existingEvent)
          : null;
      }

      const created = await tx.calendarEvent.create({
        data: {
          userId: input.userId,
          ...inbound.event,
          provider: 'google',
          providerEventId: inbound.googleEventId,
          status: inbound.status,
          syncState: 'synced',
          revision: 1,
          lastSyncedAt: now,
          recurringParentProviderEventId: master.providerEventId,
          originalStartAt: inbound.originalStartAt,
          originalStartDate: inbound.originalStartDate,
        },
        select: eventSelect,
      });

      await tx.calendarEventLink.create({
        data: {
          bindingId: binding.id,
          calendarEventId: created.id,
          googleEventId: inbound.googleEventId,
          recurringParentProviderEventId: master.providerEventId,
          originalStartAt: inbound.originalStartAt,
          originalStartDate: inbound.originalStartDate,
          etag: inbound.etag,
          remoteSnapshot: inputJsonObject(inbound.rawSnapshot),
          commonSnapshot: commonSnapshot(inbound.commonSnapshot),
          syncedRevision: created.revision,
        },
      });

      return event(created);
    });
  }

  async materializeLocalOccurrence(input: {
    userId: string;
    seriesEventId: string;
    occurrenceKey: string;
    expectedSeriesRevision: number;
    startAt: Date | null;
    endAt: Date | null;
    allDayStartDate: Date | null;
    allDayEndDate: Date | null;
    now: Date;
  }): Promise<CalendarEvent | null> {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.occurrenceKey);
    const originalStartDate = dateOnly
      ? new Date(`${input.occurrenceKey}T00:00:00.000Z`)
      : null;

    const originalStartAt = dateOnly ? null : new Date(input.occurrenceKey);

    if (
      (dateOnly &&
        originalStartDate?.toISOString().slice(0, 10) !==
          input.occurrenceKey) ||
      (!dateOnly &&
        (!originalStartAt ||
          !Number.isFinite(originalStartAt.getTime()) ||
          originalStartAt.toISOString() !== input.occurrenceKey))
    )
      return null;

    const isAllDay = originalStartDate !== null;
    const hasValidAllDayRange =
      input.allDayStartDate !== null &&
      input.allDayEndDate !== null &&
      input.allDayEndDate > input.allDayStartDate;

    if (
      isAllDay !== hasValidAllDayRange ||
      (isAllDay && (input.startAt !== null || input.endAt !== null)) ||
      (!isAllDay &&
        (input.startAt === null ||
          input.endAt === null ||
          input.allDayStartDate !== null ||
          input.allDayEndDate !== null ||
          input.endAt <= input.startAt))
    )
      return null;

    return this.prisma.$transaction(async (tx) => {
      if (!(await this.lockUser(tx, input.userId))) return null;

      const series = await tx.calendarEvent.findFirst({
        where: {
          id: input.seriesEventId,
          userId: input.userId,
          provider: 'local',
          status: { in: ['confirmed', 'tentative'] },
          recurrence: { isEmpty: false },
          recurringParentEventId: null,
          recurringParentProviderEventId: null,
          revision: input.expectedSeriesRevision,
        },
        select: eventSelect,
      });

      if (!series || Boolean(series.allDayStartDate) !== isAllDay) return null;

      const existing = await tx.calendarEvent.findUnique({
        where: {
          recurringParentEventId_recurrenceExceptionKey: {
            recurringParentEventId: series.id,
            recurrenceExceptionKey: input.occurrenceKey,
          },
        },
        select: eventSelect,
      });

      if (existing)
        return projectLocalException(event(existing), event(series), {
          startAt: input.startAt,
          endAt: input.endAt,
          timezone: series.timezone ?? 'UTC',
          allDayStartDate: input.allDayStartDate,
          allDayEndDate: input.allDayEndDate,
        });

      const created = await tx.calendarEvent.create({
        data: {
          userId: input.userId,
          provider: 'local',
          title: series.title,
          description: series.description,
          location: series.location,
          startAt: input.startAt,
          endAt: input.endAt,
          timezone: series.timezone ?? 'UTC',
          allDayStartDate: input.allDayStartDate,
          allDayEndDate: input.allDayEndDate,
          recurrence: [],
          recurrenceOverrideFields: [],
          recurringParentEventId: series.id,
          recurrenceExceptionKey: input.occurrenceKey,
          originalStartAt,
          originalStartDate,
          attendees: series.attendees,
          status: series.status,
          syncState: 'local',
          revision: 1,
          createdAt: input.now,
          updatedAt: input.now,
        },
        select: eventSelect,
      });

      return event(created);
    });
  }

  async create(
    userId: string,
    input: CalendarEventWrite & {
      provider?: string;
      providerEventId?: string | null;
    },
  ): Promise<CalendarEvent> {
    return event(
      await this.prisma.calendarEvent.create({
        data: { userId, ...input },
        select: eventSelect,
      }),
    );
  }

  async update(
    userId: string,
    id: string,
    input: Partial<CalendarEventWrite> & {
      provider?: string;
      providerEventId?: string | null;
      status?: 'confirmed' | 'cancelled';
    },
  ): Promise<CalendarEvent | null> {
    const found = await this.prisma.calendarEvent.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!found) return null;

    return event(
      await this.prisma.calendarEvent.update({
        where: { id },
        data: input,
        select: eventSelect,
      }),
    );
  }

  async createMutation(
    userId: string,
    input: CalendarEventWrite,
    destination: 'auto' | 'local' | 'google',
    request: CalendarMutationRequest,
  ): Promise<CalendarMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.lockUser(tx, userId))) return { status: 'missing' };
      const replay = await this.readMutationReceipt(tx, userId, request);
      if (replay) return replay;

      const target = await this.createTarget(tx, userId, destination);
      if (target.status !== 'ready') return { status: target.status };

      const row = await tx.calendarEvent.create({
        data: {
          userId,
          ...input,
          provider: target.binding ? 'google' : 'local',
          syncState: target.binding ? 'pending' : 'local',
          revision: 1,
        },
        select: eventSelect,
      });

      const calendarEvent = event(row);
      const operationId = target.binding
        ? await this.createOperation(
            tx,
            userId,
            calendarEvent,
            'create',
            target.binding,
            request,
          )
        : null;

      await tx.calendarMutationReceipt.create({
        data: {
          userId,
          requestKey: request.key,
          requestFingerprint: request.fingerprint,
          resultEventId: calendarEvent.id,
          expiresAt: request.expiresAt,
        },
      });

      return {
        status: 'saved',
        event: calendarEvent,
        operationId,
        replayed: false,
      };
    });
  }

  async exportMutation(
    userId: string,
    eventId: string,
    request: CalendarMutationRequest,
  ): Promise<CalendarMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.lockUser(tx, userId))) return { status: 'missing' };
      const replay = await this.readMutationReceipt(tx, userId, request);
      if (replay) return replay;

      const current = await tx.calendarEvent.findFirst({
        where: { id: eventId, userId },
        select: {
          ...eventSelect,
          providerLink: { select: { id: true } },
        },
      });

      if (!current) return { status: 'missing' };
      if (
        current.provider !== 'local' ||
        current.providerLink ||
        current.status === 'cancelled'
      )
        return { status: 'read_only' };

      const target = await this.createTarget(tx, userId, 'google');
      if (target.status !== 'ready' || !target.binding)
        return { status: 'reconnect_required' };

      const updated = await tx.calendarEvent.update({
        where: { id: eventId },
        data: {
          provider: 'google',
          syncState: 'pending',
          syncErrorCode: null,
          revision: { increment: 1 },
        },
        select: eventSelect,
      });

      const calendarEvent = event(updated);
      const operationId = await this.createOperation(
        tx,
        userId,
        calendarEvent,
        'create',
        target.binding,
        request,
      );

      await tx.calendarMutationReceipt.create({
        data: {
          userId,
          requestKey: request.key,
          requestFingerprint: request.fingerprint,
          resultEventId: calendarEvent.id,
          expiresAt: request.expiresAt,
        },
      });

      return {
        status: 'saved',
        event: calendarEvent,
        operationId,
        replayed: false,
      };
    });
  }

  async updateMutation(
    userId: string,
    id: string,
    input: Partial<CalendarEventWrite>,
    request: CalendarMutationRequest,
  ): Promise<CalendarMutationResult> {
    return this.updateMutationWithStatus(userId, id, input, undefined, request);
  }

  async cancelMutation(
    userId: string,
    id: string,
    request: CalendarMutationRequest,
  ): Promise<CalendarMutationResult> {
    return this.updateMutationWithStatus(userId, id, {}, 'cancelled', request);
  }

  private async updateMutationWithStatus(
    userId: string,
    id: string,
    input: Partial<CalendarEventWrite>,
    status: 'cancelled' | undefined,
    request: CalendarMutationRequest,
  ): Promise<CalendarMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.lockUser(tx, userId))) return { status: 'missing' };
      const replay = await this.readMutationReceipt(tx, userId, request);
      if (replay) return replay;

      const current = await tx.calendarEvent.findFirst({
        where: { id, userId },
        select: {
          ...eventSelect,
          providerLink: {
            select: {
              bindingId: true,
              binding: { select: { integrationId: true, state: true } },
            },
          },
        },
      });

      if (!current) return { status: 'missing' };

      const target = await this.updateTarget(tx, userId, current);
      if (target.status !== 'ready') return { status: target.status };

      const localSeries =
        current.provider === 'local' && current.recurringParentEventId
          ? await tx.calendarEvent.findFirst({
              where: {
                id: current.recurringParentEventId,
                userId,
                provider: 'local',
              },
              select: eventSelect,
            })
          : null;

      if (current.recurringParentEventId && !localSeries)
        return { status: 'missing' };

      const recurrenceOverrideFields = localSeries
        ? localExceptionOverrideFields(
            event(current),
            event(localSeries),
            input,
          )
        : undefined;

      const updated = await tx.calendarEvent.update({
        where: { id },
        data: {
          ...input,
          ...temporalMutationData(input),
          ...(recurrenceOverrideFields ? { recurrenceOverrideFields } : {}),
          ...(status ? { status } : {}),
          syncState: target.binding ? 'pending' : 'local',
          syncErrorCode: null,
          revision: { increment: 1 },
        },
        select: eventSelect,
      });

      const calendarEvent = event(updated);
      const operationId = target.binding
        ? await this.createOperation(
            tx,
            userId,
            calendarEvent,
            status === 'cancelled' ? 'delete' : 'update',
            target.binding,
            request,
            eventPayload(current),
          )
        : null;

      await tx.calendarMutationReceipt.create({
        data: {
          userId,
          requestKey: request.key,
          requestFingerprint: request.fingerprint,
          resultEventId: calendarEvent.id,
          expiresAt: request.expiresAt,
        },
      });

      return {
        status: 'saved',
        event: calendarEvent,
        operationId,
        replayed: false,
      };
    });
  }

  private async lockUser(tx: Transaction, userId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`,
    );

    return rows.length === 1;
  }

  private async readMutationReceipt(
    tx: Transaction,
    userId: string,
    request: CalendarMutationRequest,
  ): Promise<CalendarMutationResult | null> {
    const now = await this.databaseNow(tx);
    const receipt = await tx.calendarMutationReceipt.findUnique({
      where: { userId_requestKey: { userId, requestKey: request.key } },
    });

    if (!receipt) return null;

    if (receipt.expiresAt <= now) {
      await tx.calendarMutationReceipt.delete({ where: { id: receipt.id } });

      return null;
    }

    if (receipt.requestFingerprint !== request.fingerprint)
      return { status: 'idempotency_conflict' };
    if (!receipt.resultEventId) return { status: 'missing' };

    const row = await tx.calendarEvent.findFirst({
      where: { id: receipt.resultEventId, userId },
      select: eventSelect,
    });

    if (!row) return { status: 'missing' };

    const operation = await tx.calendarSyncOperation.findUnique({
      where: { operationKey: operationKey(userId, request.key) },
      select: { id: true },
    });

    return {
      status: 'saved',
      event: event(row),
      operationId: operation?.id ?? null,
      replayed: true,
    };
  }

  private async createTarget(
    tx: Transaction,
    userId: string,
    destination: 'auto' | 'local' | 'google',
  ): Promise<
    | {
        status: 'ready';
        binding: { bindingId: string; connectionGeneration: number } | null;
      }
    | { status: 'reconnect_required' }
  > {
    if (destination === 'local') return { status: 'ready', binding: null };

    const integrationRow = await tx.calendarIntegration.findUnique({
      where: { userId_provider: { userId, provider: 'google' } },
      select: {
        status: true,
        connectionGeneration: true,
        activeBindingId: true,
      },
    });

    if (!integrationRow || integrationRow.status === 'disconnected')
      return destination === 'auto'
        ? { status: 'ready', binding: null }
        : { status: 'reconnect_required' };
    if (integrationRow.status !== 'connected')
      return { status: 'reconnect_required' };
    if (!integrationRow.activeBindingId)
      return { status: 'reconnect_required' };

    const binding = await tx.calendarBinding.findFirst({
      where: {
        id: integrationRow.activeBindingId,
        integration: { userId, status: 'connected' },
        state: { notIn: ['disconnected', 'paused'] },
      },
      select: { id: true },
    });

    if (!binding) return { status: 'reconnect_required' };

    return {
      status: 'ready',
      binding: {
        bindingId: binding.id,
        connectionGeneration: integrationRow.connectionGeneration,
      },
    };
  }

  private async updateTarget(
    tx: Transaction,
    userId: string,
    current: {
      id: string;
      provider: string;
      providerLink: {
        bindingId: string;
        binding: { integrationId: string; state: string };
      } | null;
    },
  ): Promise<
    | {
        status: 'ready';
        binding: { bindingId: string; connectionGeneration: number } | null;
      }
    | { status: 'reconnect_required' | 'read_only' }
  > {
    if (!current.providerLink) {
      if (current.provider === 'google') {
        const createOperation = await tx.calendarSyncOperation.findFirst({
          where: {
            calendarEventId: current.id,
            kind: 'create',
            state: { in: ['pending', 'processing'] },
          },
          orderBy: { eventRevision: 'desc' },
          select: {
            bindingId: true,
            connectionGeneration: true,
            binding: { select: { integrationId: true, state: true } },
          },
        });

        if (!createOperation) return { status: 'reconnect_required' };

        const integrationRow = await tx.calendarIntegration.findFirst({
          where: {
            id: createOperation.binding.integrationId,
            userId,
            provider: 'google',
          },
          select: {
            status: true,
            connectionGeneration: true,
            activeBindingId: true,
          },
        });

        if (!integrationRow || integrationRow.status === 'reconnect_required')
          return { status: 'reconnect_required' };
        if (
          integrationRow.status !== 'connected' ||
          integrationRow.connectionGeneration !==
            createOperation.connectionGeneration ||
          integrationRow.activeBindingId !== createOperation.bindingId ||
          ['disconnected', 'paused'].includes(createOperation.binding.state)
        )
          return { status: 'read_only' };

        return {
          status: 'ready',
          binding: {
            bindingId: createOperation.bindingId,
            connectionGeneration: createOperation.connectionGeneration,
          },
        };
      }

      return { status: 'ready', binding: null };
    }

    const integrationRow = await tx.calendarIntegration.findFirst({
      where: {
        id: current.providerLink.binding.integrationId,
        userId,
        provider: 'google',
      },
      select: {
        status: true,
        connectionGeneration: true,
        activeBindingId: true,
      },
    });

    if (!integrationRow || integrationRow.status === 'reconnect_required')
      return { status: 'reconnect_required' };
    if (
      integrationRow.status !== 'connected' ||
      integrationRow.activeBindingId !== current.providerLink.bindingId ||
      ['disconnected', 'paused'].includes(current.providerLink.binding.state)
    )
      return { status: 'read_only' };

    return {
      status: 'ready',
      binding: {
        bindingId: current.providerLink.bindingId,
        connectionGeneration: integrationRow.connectionGeneration,
      },
    };
  }

  private async createOperation(
    tx: Transaction,
    userId: string,
    row: CalendarEvent,
    kind: 'create' | 'update' | 'delete',
    binding: { bindingId: string; connectionGeneration: number },
    request: CalendarMutationRequest,
    baseSnapshot?: Prisma.InputJsonObject,
  ): Promise<string> {
    const operation = await tx.calendarSyncOperation.create({
      data: {
        bindingId: binding.bindingId,
        calendarEventId: row.id,
        operationKey: operationKey(userId, request.key),
        kind,
        connectionGeneration: binding.connectionGeneration,
        eventRevision: row.revision,
        payload: eventPayload(row),
        ...(baseSnapshot ? { baseSnapshot } : {}),
        ...(kind === 'create'
          ? { stableGoogleEventId: randomUUID().replaceAll('-', '') }
          : {}),
      },
      select: { id: true },
    });

    return operation.id;
  }

  async createOAuthRequest(input: CalendarOAuthRequestInput): Promise<void> {
    if (!Number.isSafeInteger(input.expiresInMs) || input.expiresInMs <= 0)
      throw new Error('Calendar OAuth request TTL must be a positive integer.');

    const { expiresInMs, ...request } = input;

    await this.prisma.$transaction(async (tx) => {
      const now = await this.databaseNow(tx);
      const expiresAt = new Date(now.getTime() + expiresInMs);
      if (!Number.isFinite(expiresAt.getTime()))
        throw new Error(
          'Calendar OAuth request expiry is outside the date range.',
        );

      await tx.calendarOAuthRequest.create({
        data: { ...request, expiresAt },
      });
    });
  }

  async consumeOAuthRequest(
    stateHash: string,
    browserNonceHash: string,
  ): Promise<ConsumedCalendarOAuthRequest | null> {
    return this.prisma.$transaction(async (tx) => {
      const now = await this.databaseNow(tx);
      const request = await tx.calendarOAuthRequest.findUnique({
        where: { stateHash },
        select: {
          id: true,
          userId: true,
          sessionId: true,
          browserNonceHash: true,
          idTokenNonceHash: true,
          returnTo: true,
          expiresAt: true,
          consumedAt: true,
        },
      });

      if (
        !request ||
        request.expiresAt <= now ||
        request.consumedAt ||
        request.browserNonceHash !== browserNonceHash
      )
        return null;

      const session = await tx.session.findFirst({
        where: {
          id: request.sessionId,
          userId: request.userId,
          expiresAt: { gt: now },
        },
        select: { id: true },
      });

      if (!session) return null;

      const consumed = await tx.calendarOAuthRequest.updateMany({
        where: {
          id: request.id,
          consumedAt: null,
          expiresAt: { gt: now },
          browserNonceHash,
        },
        data: { consumedAt: now },
      });

      if (consumed.count !== 1) return null;

      return {
        userId: request.userId,
        sessionId: request.sessionId,
        idTokenNonceHash: request.idTokenNonceHash,
        returnTo: request.returnTo,
      };
    });
  }

  async saveGoogleConnection(
    input: SaveGoogleConnectionInput,
  ): Promise<
    | { status: 'connected'; bindingId: string; connectionGeneration: number }
    | { status: 'needs_offline_consent' }
    | { status: 'disconnecting' }
    | { status: 'user_missing' }
  > {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.lockUser(tx, input.userId)))
        return { status: 'user_missing' };

      const existing = await tx.calendarIntegration.findUnique({
        where: {
          userId_provider: { userId: input.userId, provider: 'google' },
        },
        select: {
          id: true,
          status: true,
          googleSubject: true,
          refreshToken: true,
          activeBindingId: true,
        },
      });

      if (existing?.status === 'disconnecting')
        return { status: 'disconnecting' };

      const refreshToken =
        input.refreshToken ??
        (existing?.googleSubject === input.googleSubject &&
        existing.refreshToken
          ? this.tokenCipher.decrypt(existing.refreshToken)
          : null);

      if (!refreshToken) return { status: 'needs_offline_consent' };

      const now = await this.databaseNow(tx);

      const previousBindingIds = existing?.activeBindingId
        ? [existing.activeBindingId]
        : [];

      if (previousBindingIds.length) {
        await tx.calendarWatchChannel.updateMany({
          where: {
            bindingId: { in: previousBindingIds },
            state: { in: ['active', 'registering'] },
            stoppedAt: null,
          },
          data: { state: 'cleanup_pending', cleanupRequestedAt: now },
        });
        await tx.calendarBinding.updateMany({
          where: { id: { in: previousBindingIds } },
          data: {
            state: 'disconnected',
            leaseOwner: null,
            leaseExpiresAt: null,
            leaseEpoch: { increment: 1 },
          },
        });
        await tx.calendarSyncOperation.updateMany({
          where: {
            bindingId: { in: previousBindingIds },
            state: { notIn: ['completed', 'cancelled'] },
          },
          data: { state: 'paused' },
        });
        await tx.calendarEvent.updateMany({
          where: {
            providerLink: { is: { bindingId: { in: previousBindingIds } } },
          },
          data: { syncState: 'reconnect_required' },
        });
      }

      const integrationRow = await tx.calendarIntegration.upsert({
        where: {
          userId_provider: { userId: input.userId, provider: 'google' },
        },
        create: {
          userId: input.userId,
          provider: 'google',
          status: 'connected',
          accessToken: this.tokenCipher.encrypt(input.accessToken),
          refreshToken: this.tokenCipher.encrypt(refreshToken),
          accessTokenExpiresAt: input.expiresAt,
          scope: input.scope,
          calendarId: input.calendar.id,
          googleSubject: input.googleSubject,
          googleEmail: input.googleEmail,
          connectionGeneration: 1,
        },
        update: {
          status: 'connected',
          accessToken: this.tokenCipher.encrypt(input.accessToken),
          refreshToken: this.tokenCipher.encrypt(refreshToken),
          accessTokenExpiresAt: input.expiresAt,
          scope: input.scope,
          calendarId: input.calendar.id,
          googleSubject: input.googleSubject,
          googleEmail: input.googleEmail,
          activeBindingId: null,
          connectionGeneration: { increment: 1 },
        },
        select: { id: true, connectionGeneration: true },
      });

      const binding = await tx.calendarBinding.create({
        data: {
          integrationId: integrationRow.id,
          googleSubject: input.googleSubject,
          calendarId: input.calendar.id,
          calendarName: input.calendar.name,
          timezone: input.calendar.timezone,
          state: 'initializing',
          nextSyncAt: new Date(),
        },
        select: { id: true },
      });

      await tx.calendarIntegration.update({
        where: { id: integrationRow.id },
        data: { activeBindingId: binding.id },
      });

      return {
        status: 'connected',
        bindingId: binding.id,
        connectionGeneration: integrationRow.connectionGeneration,
      };
    });
  }

  async selectGoogleCalendar(
    userId: string,
    calendar: { id: string; name: string; timezone: string },
  ): Promise<
    | { status: 'selected'; bindingId: string; connectionGeneration: number }
    | { status: 'unchanged' }
    | { status: 'missing' }
  > {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.lockUser(tx, userId))) return { status: 'missing' };

      const integration = await tx.calendarIntegration.findUnique({
        where: { userId_provider: { userId, provider: 'google' } },
        select: {
          id: true,
          status: true,
          googleSubject: true,
          activeBindingId: true,
          connectionGeneration: true,
          activeBinding: { select: { calendarId: true, state: true } },
        },
      });

      if (
        !integration ||
        integration.status !== 'connected' ||
        !integration.googleSubject
      )
        return { status: 'missing' };

      if (
        integration.activeBindingId &&
        integration.activeBinding?.calendarId === calendar.id &&
        ['active', 'initializing'].includes(integration.activeBinding.state)
      )
        return { status: 'unchanged' };

      const existingBinding = await tx.calendarBinding.findFirst({
        where: {
          integrationId: integration.id,
          googleSubject: integration.googleSubject,
          calendarId: calendar.id,
        },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });

      const now = await this.databaseNow(tx);
      const nextGeneration = integration.connectionGeneration + 1;
      const changedIntegration = await tx.calendarIntegration.updateMany({
        where: {
          id: integration.id,
          status: 'connected',
          connectionGeneration: integration.connectionGeneration,
        },
        data: {
          calendarId: calendar.id,
          activeBindingId: existingBinding?.id ?? null,
          connectionGeneration: { increment: 1 },
        },
      });

      if (changedIntegration.count !== 1) return { status: 'missing' };

      const previousBindingId = integration.activeBindingId;

      if (previousBindingId) {
        await tx.calendarWatchChannel.updateMany({
          where: {
            bindingId: previousBindingId,
            state: { in: ['active', 'registering'] },
            stoppedAt: null,
          },
          data: { state: 'cleanup_pending', cleanupRequestedAt: now },
        });
        await tx.calendarBinding.updateMany({
          where: { id: previousBindingId },
          data: {
            state: 'disconnected',
            leaseOwner: null,
            leaseExpiresAt: null,
            leaseEpoch: { increment: 1 },
          },
        });
        await tx.calendarSyncOperation.updateMany({
          where: {
            bindingId: previousBindingId,
            state: { in: ['pending', 'processing', 'paused'] },
          },
          data: { state: 'paused', claimToken: null, claimedUntil: null },
        });
        await tx.calendarEvent.updateMany({
          where: {
            providerLink: { is: { bindingId: previousBindingId } },
          },
          data: {
            syncState: 'reconnect_required',
            syncErrorCode: 'calendar_changed',
          },
        });
      }

      let bindingId: string;

      if (existingBinding) {
        bindingId = existingBinding.id;
        await tx.calendarBinding.update({
          where: { id: bindingId },
          data: {
            calendarName: calendar.name,
            timezone: calendar.timezone,
            state: 'initializing',
            leaseOwner: null,
            leaseExpiresAt: null,
            leaseEpoch: { increment: 1 },
            nextSyncAt: now,
          },
        });
        await tx.calendarSyncOperation.updateMany({
          where: { bindingId, state: 'paused' },
          data: {
            state: 'pending',
            connectionGeneration: nextGeneration,
            nextAttemptAt: now,
            claimToken: null,
            claimedUntil: null,
          },
        });
        await tx.calendarEvent.updateMany({
          where: {
            providerLink: { is: { bindingId } },
            syncState: 'reconnect_required',
          },
          data: { syncState: 'synced', syncErrorCode: null },
        });
        await tx.calendarEvent.updateMany({
          where: {
            providerLink: { is: { bindingId } },
            syncOperations: {
              some: { bindingId, state: 'pending' },
            },
          },
          data: { syncState: 'pending', syncErrorCode: null },
        });
      } else {
        const binding = await tx.calendarBinding.create({
          data: {
            integrationId: integration.id,
            googleSubject: integration.googleSubject,
            calendarId: calendar.id,
            calendarName: calendar.name,
            timezone: calendar.timezone,
            state: 'initializing',
            nextSyncAt: now,
          },
          select: { id: true },
        });

        bindingId = binding.id;
      }

      await tx.calendarIntegration.update({
        where: { id: integration.id },
        data: { activeBindingId: bindingId },
      });

      return {
        status: 'selected',
        bindingId,
        connectionGeneration: nextGeneration,
      };
    });
  }

  async retryFailedOperation(
    userId: string,
    eventId: string,
  ): Promise<CalendarRetryOperationResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const now = await this.databaseNow(tx);
        if (!(await this.lockUser(tx, userId))) return { status: 'missing' };

        const current = await tx.calendarEvent.findFirst({
          where: { id: eventId, userId },
          select: {
            ...eventSelect,
            providerLink: {
              select: {
                bindingId: true,
                binding: { select: { id: true, state: true } },
              },
            },
          },
        });

        if (!current) return { status: 'missing' };
        if (
          current.provider !== 'google' ||
          current.syncState !== 'error' ||
          !current.providerLink
        )
          return { status: 'not_retryable' };

        const integrationRow = await tx.calendarIntegration.findUnique({
          where: { userId_provider: { userId, provider: 'google' } },
          select: {
            status: true,
            connectionGeneration: true,
            activeBindingId: true,
          },
        });

        if (
          !integrationRow ||
          integrationRow.status !== 'connected' ||
          !integrationRow.activeBindingId
        )
          return { status: 'reconnect_required' };

        if (
          current.providerLink.bindingId !== integrationRow.activeBindingId ||
          current.providerLink.binding.id !== integrationRow.activeBindingId ||
          !['active', 'initializing'].includes(
            current.providerLink.binding.state,
          )
        )
          return { status: 'reconnect_required' };

        const operation = await tx.calendarSyncOperation.findFirst({
          where: {
            calendarEventId: eventId,
            bindingId: integrationRow.activeBindingId,
            connectionGeneration: integrationRow.connectionGeneration,
            eventRevision: { lte: current.revision },
            state: { in: ['failed', 'pending', 'processing'] },
            OR: [
              { lastErrorCode: null },
              { lastErrorCode: { not: 'conflict_resolved' } },
            ],
          },
          orderBy: [
            { eventRevision: 'asc' },
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
          select: { id: true, state: true, eventRevision: true },
        });

        if (!operation) return { status: 'not_retryable' };

        if (operation.state !== 'processing') {
          const requeued = await tx.calendarSyncOperation.updateMany({
            where: {
              id: operation.id,
              bindingId: integrationRow.activeBindingId,
              connectionGeneration: integrationRow.connectionGeneration,
              eventRevision: operation.eventRevision,
              state: operation.state,
            },
            data: {
              state: 'pending',
              nextAttemptAt: now,
              claimToken: null,
              claimedUntil: null,
              retryBudgetAttempts: 0,
              firstAttemptAt: null,
              lastErrorCode: null,
              lastErrorMessage: null,
            },
          });

          if (requeued.count !== 1) throw new CalendarRetryRaceError();
        }

        const requeuedEvent = await tx.calendarEvent.updateMany({
          where: {
            id: eventId,
            userId,
            provider: 'google',
            revision: current.revision,
            syncState: 'error',
          },
          data: { syncState: 'pending', syncErrorCode: null },
        });

        if (requeuedEvent.count !== 1) throw new CalendarRetryRaceError();

        const updated = await tx.calendarEvent.findFirst({
          where: { id: eventId, userId },
          select: eventSelect,
        });

        if (!updated) throw new CalendarRetryRaceError();

        return {
          status: 'queued',
          event: event(updated),
          operationId: operation.id,
        };
      });
    } catch (error) {
      if (error instanceof CalendarRetryRaceError)
        return { status: 'not_retryable' };

      throw error;
    }
  }

  async canSendCalendarRequest(
    fence: CalendarRequestFence,
    minimumRemainingMs: number,
  ): Promise<boolean> {
    if (!Number.isSafeInteger(minimumRemainingMs) || minimumRemainingMs < 0)
      throw new Error(
        'Calendar request lease budget must be a non-negative integer.',
      );
    const deadline = Prisma.sql`clock_timestamp() + ${minimumRemainingMs} * INTERVAL '1 millisecond'`;
    const generation =
      fence.kind === 'credential'
        ? Prisma.sql`i."credentialGeneration" = ${fence.credentialGeneration}`
        : Prisma.sql`i."connectionGeneration" = ${fence.connectionGeneration}`;

    const claim =
      fence.kind === 'operation'
        ? Prisma.sql`EXISTS (SELECT 1 FROM calendar_sync_operation o WHERE o.id = ${fence.operationId} AND o."bindingId" = b.id AND o.state = 'processing' AND o."connectionGeneration" = i."connectionGeneration" AND o."claimToken" = ${fence.claimToken} AND o."claimEpoch" = ${fence.claimEpoch} AND o."claimedUntil" > ${deadline})`
        : fence.kind === 'binding'
          ? Prisma.sql`b."leaseOwner" = ${fence.owner} AND b."leaseEpoch" = ${fence.leaseEpoch} AND b."leaseExpiresAt" > ${deadline}`
          : Prisma.sql`i."credentialLeaseOwner" = ${fence.owner} AND i."credentialLeaseExpiresAt" > ${deadline}`;

    const rows = await this.prisma.$queryRaw<
      Array<{ allowed: boolean }>
    >(Prisma.sql`
      SELECT EXISTS (SELECT 1 FROM calendar_binding b
        JOIN calendar_integration i ON i.id = b."integrationId"
        WHERE b.id = ${fence.bindingId} AND b.state IN ('active', 'initializing')
          AND i.status = 'connected' AND i."activeBindingId" = b.id
          AND i."googleSubject" = b."googleSubject" AND ${generation} AND ${claim}) AS allowed`);

    if (!rows[0])
      throw new Error('Calendar request fence query returned no result.');

    return rows[0].allowed;
  }

  async claimOperation(
    operationId: string,
    claimToken: string,
    leaseDurationMs: number,
  ): Promise<CalendarSyncOperationClaim | null> {
    return this.prisma.$transaction(async (tx) => {
      const now = await this.databaseNow(tx);
      const leaseUntil = this.leaseExpiresAt(now, leaseDurationMs);
      const candidate = await tx.calendarSyncOperation.findUnique({
        where: { id: operationId },
        include: {
          binding: {
            include: {
              integration: true,
            },
          },
          calendarEvent: {
            select: {
              providerLink: {
                select: {
                  id: true,
                  googleEventId: true,
                  etag: true,
                  remoteSnapshot: true,
                  commonSnapshot: true,
                },
              },
            },
          },
        },
      });

      if (!candidate) return null;

      const binding = candidate.binding;
      const integrationRow = binding.integration;
      if (
        !['pending', 'processing'].includes(candidate.state) ||
        candidate.nextAttemptAt > now ||
        (candidate.state === 'processing' &&
          candidate.claimedUntil !== null &&
          candidate.claimedUntil > now) ||
        candidate.connectionGeneration !==
          integrationRow.connectionGeneration ||
        integrationRow.status !== 'connected' ||
        integrationRow.activeBindingId !== binding.id ||
        !['active', 'initializing'].includes(binding.state) ||
        !integrationRow.accessToken
      )
        return null;

      if (candidate.calendarEventId) {
        const earlier = await tx.calendarSyncOperation.count({
          where: {
            calendarEventId: candidate.calendarEventId,
            eventRevision: { lt: candidate.eventRevision },
            OR: [
              {
                state: { in: ['pending', 'processing', 'paused', 'conflict'] },
              },
              {
                state: 'failed',
                OR: [
                  { lastErrorCode: null },
                  { lastErrorCode: { not: 'conflict_resolved' } },
                ],
              },
            ],
          },
        });

        if (earlier > 0) return null;
      }

      const claimed = await tx.calendarSyncOperation.updateMany({
        where: {
          id: operationId,
          state: candidate.state,
          nextAttemptAt: { lte: now },
          OR: [{ claimedUntil: null }, { claimedUntil: { lte: now } }],
        },
        data: {
          state: 'processing',
          claimToken,
          claimEpoch: { increment: 1 },
          claimedUntil: leaseUntil,
          attempts: { increment: 1 },
          retryBudgetAttempts: { increment: 1 },
          firstAttemptAt: candidate.firstAttemptAt ?? now,
        },
      });

      if (claimed.count !== 1) return null;

      const operation = await tx.calendarSyncOperation.findUniqueOrThrow({
        where: { id: operationId },
        select: {
          id: true,
          kind: true,
          attempts: true,
          retryBudgetAttempts: true,
          createdAt: true,
          firstAttemptAt: true,
          connectionGeneration: true,
          eventRevision: true,
          payload: true,
          baseSnapshot: true,
          stableGoogleEventId: true,
          claimToken: true,
          claimEpoch: true,
        },
      });

      const link = candidate.calendarEvent?.providerLink ?? null;

      return {
        claimedAt: now,
        operation: {
          ...operation,
          kind: operationKind(operation.kind),
          claimToken: operation.claimToken ?? claimToken,
          claimEpoch: operation.claimEpoch,
        },
        binding: {
          id: binding.id,
          userId: integrationRow.userId,
          googleSubject: binding.googleSubject,
          calendarId: binding.calendarId,
          timezone: binding.timezone,
        },
        credentials: {
          accessToken: this.tokenCipher.decrypt(integrationRow.accessToken),
          refreshToken: integrationRow.refreshToken
            ? this.tokenCipher.decrypt(integrationRow.refreshToken)
            : null,
          accessTokenExpiresAt: integrationRow.accessTokenExpiresAt,
          credentialGeneration: integrationRow.credentialGeneration,
        },
        eventLink: link,
      };
    });
  }

  async completeOperation(
    input: CompleteCalendarSyncOperation,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const owner = await tx.calendarSyncOperation.findUnique({
        where: { id: input.operationId },
        select: {
          binding: { select: { integration: { select: { userId: true } } } },
        },
      });

      if (
        !owner ||
        !(await this.lockUser(tx, owner.binding.integration.userId))
      )
        return false;
      const now = await this.databaseNow(tx);
      const operation = await tx.calendarSyncOperation.findUnique({
        where: { id: input.operationId },
        include: {
          binding: { include: { integration: true } },
        },
      });

      if (!operation) return false;
      const integrationRow = operation.binding.integration;
      if (
        operation.state !== 'processing' ||
        operation.claimToken !== input.claimToken ||
        operation.claimEpoch !== input.claimEpoch ||
        !operation.claimedUntil ||
        operation.claimedUntil <= now ||
        operation.connectionGeneration !==
          integrationRow.connectionGeneration ||
        integrationRow.status !== 'connected' ||
        integrationRow.activeBindingId !== operation.bindingId
      )
        return false;

      const changed = await tx.calendarSyncOperation.updateMany({
        where: {
          id: input.operationId,
          state: 'processing',
          claimToken: input.claimToken,
          claimEpoch: input.claimEpoch,
          claimedUntil: { gt: now },
        },
        data: {
          state: 'completed',
          claimedUntil: null,
          claimToken: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });

      if (changed.count !== 1) return false;

      if (operation.kind === 'delete') {
        const payload = snapshotRecord(operation.payload);
        const savedRemoteId =
          typeof payload.providerEventId === 'string' &&
          payload.providerEventId.trim()
            ? payload.providerEventId
            : operation.stableGoogleEventId;

        const identity = operation.calendarEventId
          ? { calendarEventId: operation.calendarEventId }
          : savedRemoteId
            ? { googleEventId: savedRemoteId }
            : null;

        const link = identity
          ? await tx.calendarEventLink.findFirst({
              where: { bindingId: operation.bindingId, ...identity },
              select: { id: true, googleEventId: true },
            })
          : null;

        if (link) {
          await tx.calendarEventLink.update({
            where: { id: link.id },
            data: {
              tombstoneAt: now,
              etag: null,
              syncedRevision: operation.eventRevision,
              commonSnapshot: commonSnapshot({
                ...payload,
                status: 'cancelled',
              }),
              remoteSnapshot: { id: link.googleEventId, status: 'cancelled' },
            },
          });
        }

        if (operation.calendarEventId) {
          await tx.calendarEvent.updateMany({
            where: {
              id: operation.calendarEventId,
              revision: operation.eventRevision,
              status: 'cancelled',
              syncState: 'pending',
            },
            data: {
              syncState: 'synced',
              lastSyncedAt: now,
              syncErrorCode: null,
            },
          });
        }
      } else {
        const googleEventId =
          input.remoteEventId ?? operation.stableGoogleEventId;

        if (!googleEventId || !operation.calendarEventId)
          throw new Error(
            'Completed calendar write is missing its remote event identity.',
          );

        const eventRow = await tx.calendarEvent.findUnique({
          where: { id: operation.calendarEventId },
          select: { revision: true, provider: true },
        });

        if (!eventRow) return true;

        const remoteSnapshot = input.remoteSnapshot
          ? inputJsonObject(input.remoteSnapshot)
          : inputJsonObject(operation.payload);

        if (
          input.reconciledEvent &&
          (input.reconciledEvent.googleEventId !== googleEventId ||
            !input.reconciledEvent.event ||
            input.reconciledEvent.status === 'cancelled')
        )
          throw new Error(
            'Reconciled calendar completion has an invalid event identity or status.',
          );
        const commonSnapshot = inputJsonObject(
          input.reconciledEvent
            ? input.reconciledEvent.commonSnapshot
            : operation.payload,
        );

        const link = await tx.calendarEventLink.findFirst({
          where: {
            bindingId: operation.bindingId,
            OR: [
              { calendarEventId: operation.calendarEventId },
              { googleEventId },
            ],
          },
          select: { id: true },
        });

        const linkData = {
          calendarEventId: operation.calendarEventId,
          googleEventId,
          etag: input.remoteEtag ?? null,
          remoteSnapshot,
          commonSnapshot,
          syncedRevision: operation.eventRevision,
          tombstoneAt: null,
        };

        if (link) {
          await tx.calendarEventLink.update({
            where: { id: link.id },
            data: linkData,
          });
        } else {
          await tx.calendarEventLink.create({
            data: { bindingId: operation.bindingId, ...linkData },
          });
        }

        await tx.calendarEvent.updateMany({
          where: { id: operation.calendarEventId },
          data: {
            provider: 'google',
            providerEventId: googleEventId,
            lastSyncedAt: now,
          },
        });
        // A provider acknowledgement confirms this operation's revision only.
        // Preserve newer pending work and already surfaced conflict/error states.
        const reconciliationChanged =
          input.reconciledEvent !== undefined &&
          snapshotChangedFields(
            snapshotRecord(operation.payload),
            snapshotRecord(input.reconciledEvent.commonSnapshot),
          ).length > 0;

        const confirmed = await tx.calendarEvent.updateMany({
          where: {
            id: operation.calendarEventId,
            revision: operation.eventRevision,
            syncState: 'pending',
          },
          data: {
            ...(input.reconciledEvent
              ? {
                  ...eventDataFromSnapshot(
                    snapshotRecord(input.reconciledEvent.commonSnapshot),
                    input.reconciledEvent,
                  ),
                  ...(reconciliationChanged
                    ? { revision: { increment: 1 } }
                    : {}),
                }
              : {}),
            syncState: 'synced',
            syncErrorCode: null,
          },
        });

        if (confirmed.count === 1 && reconciliationChanged)
          await tx.calendarEventLink.updateMany({
            where: {
              bindingId: operation.bindingId,
              calendarEventId: operation.calendarEventId,
            },
            data: { syncedRevision: operation.eventRevision + 1 },
          });
      }

      return true;
    });
  }

  async failOperation(input: FailCalendarSyncOperation): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const now = await this.databaseNow(tx);
      const operation = await tx.calendarSyncOperation.findUnique({
        where: { id: input.operationId },
        select: {
          bindingId: true,
          eventRevision: true,
          calendarEventId: true,
          baseSnapshot: true,
          payload: true,
          retryBudgetAttempts: true,
          firstAttemptAt: true,
          state: true,
          claimToken: true,
          claimEpoch: true,
          claimedUntil: true,
        },
      });

      if (
        !operation ||
        operation.state !== 'processing' ||
        operation.claimToken !== input.claimToken ||
        operation.claimEpoch !== input.claimEpoch ||
        !operation.claimedUntil ||
        operation.claimedUntil <= now
      )
        return false;

      const nextState =
        input.outcome === 'retry' || input.outcome === 'deferred'
          ? 'pending'
          : input.outcome === 'reconnect_required'
            ? 'paused'
            : input.outcome;

      const isScheduledRetry =
        input.outcome === 'retry' || input.outcome === 'deferred';

      if (isScheduledRetry !== (input.retryDelayMs !== undefined))
        throw new Error(
          'Calendar retry outcomes must include only a relative retry delay.',
        );

      const commitNow = await this.databaseNow(tx);

      const changed = await tx.calendarSyncOperation.updateMany({
        where: {
          id: input.operationId,
          state: 'processing',
          claimToken: input.claimToken,
          claimEpoch: input.claimEpoch,
          claimedUntil: { gt: commitNow },
        },
        data: {
          state: nextState,
          nextAttemptAt: this.retryAt(commitNow, input.retryDelayMs ?? 0),
          claimedUntil: null,
          claimToken: null,
          ...(input.outcome === 'deferred'
            ? {
                attempts: { decrement: 1 },
                retryBudgetAttempts: { decrement: 1 },
                ...(operation.retryBudgetAttempts <= 1
                  ? { firstAttemptAt: null }
                  : {}),
                lastErrorCode: null,
                lastErrorMessage: null,
              }
            : {
                lastErrorCode: input.errorCode,
                lastErrorMessage: input.errorCode,
              }),
        },
      });

      if (changed.count !== 1) return false;

      if (input.outcome === 'reconnect_required') {
        const binding = await tx.calendarBinding.findUnique({
          where: { id: operation.bindingId },
          select: { integrationId: true },
        });

        if (binding) {
          await tx.calendarIntegration.update({
            where: { id: binding.integrationId },
            data: { status: 'reconnect_required' },
          });
          await tx.calendarBinding.update({
            where: { id: operation.bindingId },
            data: {
              state: 'paused',
              leaseOwner: null,
              leaseExpiresAt: null,
              leaseEpoch: { increment: 1 },
              lastErrorCode: input.errorCode,
            },
          });
          await tx.calendarSyncOperation.updateMany({
            where: {
              bindingId: operation.bindingId,
              state: { in: ['pending', 'processing'] },
            },
            data: { state: 'paused', claimedUntil: null, claimToken: null },
          });
          await tx.calendarEvent.updateMany({
            where: {
              providerLink: { is: { bindingId: operation.bindingId } },
            },
            data: {
              syncState: 'reconnect_required',
              syncErrorCode: input.errorCode,
            },
          });
        }
      } else if (operation.calendarEventId && input.outcome !== 'deferred') {
        if (input.outcome === 'conflict' && input.conflict) {
          const localEvent = await tx.calendarEvent.findUnique({
            where: { id: operation.calendarEventId },
            select: eventSelect,
          });

          const link = await tx.calendarEventLink.findFirst({
            where: {
              bindingId: operation.bindingId,
              calendarEventId: operation.calendarEventId,
            },
            select: { id: true },
          });

          if (link) {
            const remote = conflictRemoteParts(input.conflict.remoteSnapshot);
            const rawSnapshot = inputJsonObject(remote.resource);
            const remoteCommon = commonSnapshot(remote.common);
            await tx.calendarSyncConflict.create({
              data: {
                bindingId: operation.bindingId,
                eventLinkId: link.id,
                localRevision:
                  localEvent?.revision ??
                  Number(
                    (operation.payload as { revision?: unknown }).revision ?? 0,
                  ),
                baseSnapshot:
                  operation.baseSnapshot === null
                    ? Prisma.JsonNull
                    : inputJsonObject(operation.baseSnapshot),
                localSnapshot: inputJsonObject(
                  localEvent ? eventPayload(localEvent) : operation.payload,
                ),
                remoteSnapshot: conflictRemoteSnapshot(
                  remote.resource,
                  remoteCommon,
                ),
                conflictingFields: input.conflict.conflictingFields,
              },
            });
            await tx.calendarEventLink.update({
              where: { id: link.id },
              data: {
                etag:
                  typeof remote.resource.etag === 'string'
                    ? remote.resource.etag
                    : null,
                remoteSnapshot: rawSnapshot,
              },
            });
            await tx.calendarSyncOperation.updateMany({
              where: {
                bindingId: operation.bindingId,
                calendarEventId: operation.calendarEventId,
                state: 'pending',
              },
              data: {
                state: 'conflict',
                claimedUntil: null,
                claimToken: null,
                lastErrorCode: input.errorCode,
                lastErrorMessage: input.errorCode,
              },
            });
          }
        }

        await tx.calendarEvent.updateMany({
          where: {
            id: operation.calendarEventId,
            ...(input.outcome === 'failed'
              ? {
                  revision: { gte: operation.eventRevision },
                  syncState: 'pending',
                }
              : {}),
          },
          data: {
            syncState: input.outcome === 'conflict' ? 'conflict' : 'error',
            syncErrorCode: input.errorCode,
          },
        });
      }

      return true;
    });
  }

  async cleanupSyncRecords(input: {
    completedOperationRetentionDays: number;
    tombstoneRetentionDays: number;
    batchSize: number;
  }): Promise<CalendarSyncRetentionResult> {
    if (
      !Number.isSafeInteger(input.completedOperationRetentionDays) ||
      input.completedOperationRetentionDays < 1 ||
      input.completedOperationRetentionDays > 3650
    )
      throw new Error(
        'Calendar completed operation retention must be 1–3650 days.',
      );
    if (
      !Number.isSafeInteger(input.batchSize) ||
      input.batchSize < 1 ||
      input.batchSize > 1000
    )
      throw new Error('Calendar retention batch size must be 1–1000.');

    if (
      !Number.isSafeInteger(input.tombstoneRetentionDays) ||
      input.tombstoneRetentionDays < 1 ||
      input.tombstoneRetentionDays > 3650
    )
      throw new Error('Calendar tombstone retention must be 1–3650 days.');

    return this.prisma.$transaction(
      async (tx) => {
        const ordinaryTombstones = await this.cleanupOrdinaryTombstones(
          tx,
          input,
        );

        // The database clock and row locks make concurrent sweeps bounded and
        // disjoint. Unfinished operations and conflict history remain intact.
        const rows = await tx.$queryRaw<
          Omit<CalendarSyncRetentionResult, 'ordinaryTombstones'>[]
        >(Prisma.sql`
      WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS now),
      operation_candidates AS (
        SELECT operation.id FROM calendar_sync_operation operation, clock
        WHERE operation.state = 'completed'
          AND operation."updatedAt" < clock.now - ${input.completedOperationRetentionDays} * INTERVAL '1 day'
          AND NOT EXISTS (
            SELECT 1 FROM calendar_mutation_receipt receipt
            WHERE receipt."resultEventId" = operation."calendarEventId"
              AND receipt."expiresAt" > clock.now
          )
        ORDER BY operation."updatedAt", operation.id
        LIMIT ${input.batchSize} FOR UPDATE OF operation SKIP LOCKED
      ), deleted_operations AS (
        DELETE FROM calendar_sync_operation operation USING operation_candidates candidate
        WHERE operation.id = candidate.id RETURNING operation.id
      ), oauth_candidates AS (
        SELECT request.id FROM calendar_oauth_request request, clock
        WHERE request."expiresAt" <= clock.now
        ORDER BY request."expiresAt", request.id
        LIMIT ${input.batchSize} FOR UPDATE OF request SKIP LOCKED
      ), deleted_oauth AS (
        DELETE FROM calendar_oauth_request request USING oauth_candidates candidate
        WHERE request.id = candidate.id RETURNING request.id
      ), receipt_candidates AS (
        SELECT receipt.id FROM calendar_mutation_receipt receipt, clock
        WHERE receipt."expiresAt" <= clock.now
        ORDER BY receipt."expiresAt", receipt.id
        LIMIT ${input.batchSize} FOR UPDATE OF receipt SKIP LOCKED
      ), deleted_receipts AS (
        DELETE FROM calendar_mutation_receipt receipt USING receipt_candidates candidate
        WHERE receipt.id = candidate.id RETURNING receipt.id
      )
      SELECT
        (SELECT COUNT(*)::integer FROM deleted_operations) AS "completedOperations",
        (SELECT COUNT(*)::integer FROM deleted_oauth) AS "expiredOAuthRequests",
        (SELECT COUNT(*)::integer FROM deleted_receipts) AS "expiredMutationReceipts"
    `);

        const result = rows[0];
        if (
          !result ||
          Object.values(result).some(
            (count) => !Number.isSafeInteger(count) || count < 0,
          )
        )
          throw new Error(
            'Calendar retention query returned invalid cleanup counts.',
          );

        return { ...result, ordinaryTombstones };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  private async cleanupOrdinaryTombstones(
    tx: Transaction,
    input: {
      tombstoneRetentionDays: number;
      batchSize: number;
    },
  ): Promise<number> {
    const now = await this.databaseNow(tx);
    const cutoff = new Date(
      now.getTime() - input.tombstoneRetentionDays * 86_400_000,
    );

    const eligible = Prisma.sql`
      link."tombstoneAt" < ${cutoff}
      AND link."recurringParentProviderEventId" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM calendar_event event WHERE event.id = link."calendarEventId"
          AND (event.status <> 'cancelled' OR event."syncState" <> 'synced'
            OR cardinality(event.recurrence) > 0)
      )
      AND NOT EXISTS (SELECT 1 FROM calendar_sync_conflict conflict
        WHERE conflict."eventLinkId" = link.id)
      AND NOT EXISTS (SELECT 1 FROM calendar_sync_operation operation
        WHERE operation."bindingId" = link."bindingId" AND operation.state <> 'completed'
          AND (operation."calendarEventId" = link."calendarEventId"
            OR operation."stableGoogleEventId" = link."googleEventId"
            OR operation.payload->>'providerEventId' = link."googleEventId"))
      AND NOT EXISTS (SELECT 1 FROM calendar_mutation_receipt receipt
        WHERE receipt."resultEventId" = link."calendarEventId" AND receipt."expiresAt" > ${now})
    `;

    // Lock owners before links, as mutations do. Skipping locked owners during
    // candidate selection prevents an older busy owner from starving the batch.
    const candidates = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT link.id FROM calendar_event_link link
      JOIN calendar_binding binding ON binding.id = link."bindingId"
      JOIN calendar_integration integration ON integration.id = binding."integrationId"
      JOIN "user" owner ON owner.id = integration."userId"
      WHERE ${eligible} ORDER BY link."tombstoneAt", link.id LIMIT ${input.batchSize}
      FOR UPDATE OF owner SKIP LOCKED
    `);

    if (candidates.length === 0) return 0;

    // Lock links and recheck dependencies in a fresh READ COMMITTED snapshot.
    // The selection snapshot may precede a just-committed operation/conflict.
    const candidateIds = candidates.map((candidate) => candidate.id);
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM calendar_event_link WHERE id IN (${Prisma.join(candidateIds)})
      ORDER BY id FOR UPDATE SKIP LOCKED
    `);

    if (locked.length === 0) return 0;
    const removed = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      DELETE FROM calendar_event_link link WHERE link.id IN (${Prisma.join(locked.map((link) => link.id))})
      AND ${eligible} RETURNING link.id
    `);

    return removed.length;
  }

  async dueOperationIds(
    limit: number,
  ): Promise<Array<{ id: string; attempts: number }>> {
    const now = await this.databaseNow();
    const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 100));
    const rows = await this.prisma.calendarSyncOperation.findMany({
      where: {
        OR: [
          { state: 'pending', nextAttemptAt: { lte: now } },
          { state: 'processing', claimedUntil: { lte: now } },
        ],
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: boundedLimit,
      select: { id: true, attempts: true },
    });

    return rows;
  }

  async claimCredentialRefresh(
    bindingId: string,
    expectedGeneration: number,
    owner: string,
    leaseDurationMs: number,
    minimumValidityMs: number,
  ): Promise<CalendarCredentialRefreshClaim> {
    return this.prisma.$transaction(async (tx) => {
      const now = await this.databaseNow(tx);
      const leaseUntil = this.leaseExpiresAt(now, leaseDurationMs);
      const binding = await tx.calendarBinding.findUnique({
        where: { id: bindingId },
        include: { integration: true },
      });

      const integrationRow = binding?.integration;
      if (
        !binding ||
        !integrationRow ||
        (binding.state !== 'active' && binding.state !== 'initializing') ||
        integrationRow.status !== 'connected' ||
        integrationRow.activeBindingId !== bindingId ||
        !integrationRow.accessToken
      )
        return { status: 'unavailable' };

      if (
        integrationRow.accessTokenExpiresAt &&
        integrationRow.accessTokenExpiresAt.getTime() >
          now.getTime() + minimumValidityMs
      )
        return {
          status: 'fresh',
          accessToken: this.tokenCipher.decrypt(integrationRow.accessToken),
          expiresAt: integrationRow.accessTokenExpiresAt,
          credentialGeneration: integrationRow.credentialGeneration,
        };

      if (!integrationRow.refreshToken) return { status: 'unavailable' };
      if (
        integrationRow.credentialLeaseOwner &&
        integrationRow.credentialLeaseExpiresAt &&
        integrationRow.credentialLeaseExpiresAt > now
      )
        return { status: 'busy' };

      const updated = await tx.calendarIntegration.updateMany({
        where: {
          id: integrationRow.id,
          status: 'connected',
          activeBindingId: bindingId,
          credentialGeneration: expectedGeneration,
          OR: [
            { credentialLeaseOwner: null },
            { credentialLeaseExpiresAt: null },
            { credentialLeaseExpiresAt: { lte: now } },
          ],
        },
        data: {
          credentialLeaseOwner: owner,
          credentialLeaseExpiresAt: leaseUntil,
        },
      });

      if (updated.count !== 1) {
        const latest = await tx.calendarIntegration.findUnique({
          where: { id: integrationRow.id },
          select: {
            accessToken: true,
            accessTokenExpiresAt: true,
            credentialGeneration: true,
            credentialLeaseExpiresAt: true,
          },
        });

        if (
          latest?.accessToken &&
          latest.accessTokenExpiresAt &&
          latest.accessTokenExpiresAt.getTime() >
            now.getTime() + minimumValidityMs
        )
          return {
            status: 'fresh',
            accessToken: this.tokenCipher.decrypt(latest.accessToken),
            expiresAt: latest.accessTokenExpiresAt,
            credentialGeneration: latest.credentialGeneration,
          };

        return { status: 'busy' };
      }

      return {
        status: 'leased',
        integrationId: integrationRow.id,
        userId: integrationRow.userId,
        googleSubject: binding.googleSubject,
        refreshToken: this.tokenCipher.decrypt(integrationRow.refreshToken),
        credentialGeneration: integrationRow.credentialGeneration,
      };
    });
  }

  async completeCredentialRefresh(input: {
    bindingId: string;
    expectedGeneration: number;
    owner: string;
    accessToken: string;
    expiresAt: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const now = await this.databaseNow(tx);
      const binding = await tx.calendarBinding.findUnique({
        where: { id: input.bindingId },
        select: { integrationId: true },
      });

      if (!binding) return false;

      const updated = await tx.calendarIntegration.updateMany({
        where: {
          id: binding.integrationId,
          status: 'connected',
          activeBindingId: input.bindingId,
          credentialGeneration: input.expectedGeneration,
          credentialLeaseOwner: input.owner,
          credentialLeaseExpiresAt: { gt: now },
        },
        data: {
          accessToken: this.tokenCipher.encrypt(input.accessToken),
          accessTokenExpiresAt: input.expiresAt,
          credentialGeneration: { increment: 1 },
          credentialLeaseOwner: null,
          credentialLeaseExpiresAt: null,
        },
      });

      return updated.count === 1;
    });
  }

  async releaseCredentialRefresh(
    bindingId: string,
    expectedGeneration: number,
    owner: string,
  ): Promise<boolean> {
    const binding = await this.prisma.calendarBinding.findUnique({
      where: { id: bindingId },
      select: { integrationId: true },
    });

    if (!binding) return false;

    const updated = await this.prisma.calendarIntegration.updateMany({
      where: {
        id: binding.integrationId,
        credentialGeneration: expectedGeneration,
        credentialLeaseOwner: owner,
      },
      data: { credentialLeaseOwner: null, credentialLeaseExpiresAt: null },
    });

    return updated.count === 1;
  }

  async claimBindingSync(
    bindingId: string,
    connectionGeneration: number,
    owner: string,
    leaseDurationMs: number,
  ): Promise<CalendarBindingSyncClaim | null> {
    return this.prisma.$transaction(async (tx) => {
      const now = await this.databaseNow(tx);
      const leaseUntil = this.leaseExpiresAt(now, leaseDurationMs);
      const binding = await tx.calendarBinding.findUnique({
        where: { id: bindingId },
        include: { integration: true },
      });

      if (
        !binding ||
        !['active', 'initializing'].includes(binding.state) ||
        binding.integration.status !== 'connected' ||
        binding.integration.activeBindingId !== binding.id ||
        binding.integration.connectionGeneration !== connectionGeneration ||
        !binding.integration.accessToken ||
        (binding.leaseExpiresAt !== null && binding.leaseExpiresAt > now)
      )
        return null;

      const fullImport = binding.syncToken === null;
      const generation = fullImport
        ? Math.max(1, binding.fullImportGeneration)
        : binding.fullImportGeneration;

      const targetRevision =
        binding.nextPageToken || binding.pendingFullImportSyncToken
          ? binding.pullTargetRevision || binding.dirtyRevision
          : binding.dirtyRevision;

      const claimed = await tx.calendarBinding.updateMany({
        where: {
          id: bindingId,
          state: { in: ['active', 'initializing'] },
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
        data: {
          leaseOwner: owner,
          leaseExpiresAt: leaseUntil,
          leaseEpoch: { increment: 1 },
          ...(fullImport ? { fullImportGeneration: generation } : {}),
          ...(!(binding.nextPageToken || binding.pendingFullImportSyncToken)
            ? { pullTargetRevision: targetRevision }
            : {}),
        },
      });

      if (claimed.count !== 1) return null;

      const current = await tx.calendarBinding.findUniqueOrThrow({
        where: { id: bindingId },
        include: { integration: true },
      });

      if (
        current.integration.status !== 'connected' ||
        current.integration.activeBindingId !== bindingId ||
        current.integration.connectionGeneration !== connectionGeneration ||
        !current.integration.accessToken
      ) {
        await tx.calendarBinding.updateMany({
          where: { id: bindingId, leaseOwner: owner },
          data: { leaseOwner: null, leaseExpiresAt: null },
        });

        return null;
      }

      return {
        id: current.id,
        userId: current.integration.userId,
        integrationId: current.integrationId,
        googleSubject: current.googleSubject,
        calendarId: current.calendarId,
        timezone: current.timezone,
        state: current.state,
        lastSyncedAt: current.lastSyncedAt,
        syncToken: current.syncToken,
        nextPageToken: current.nextPageToken,
        pendingFullImportSyncToken: current.pendingFullImportSyncToken,
        dirtyRevision: current.dirtyRevision,
        capturedDirtyRevision: current.pullTargetRevision,
        fullImportGeneration: current.fullImportGeneration,
        leaseOwner: owner,
        leaseEpoch: current.leaseEpoch,
        connectionGeneration: current.integration.connectionGeneration,
        credentials: {
          accessToken: this.tokenCipher.decrypt(
            current.integration.accessToken,
          ),
          refreshToken: current.integration.refreshToken
            ? this.tokenCipher.decrypt(current.integration.refreshToken)
            : null,
          accessTokenExpiresAt: current.integration.accessTokenExpiresAt,
          credentialGeneration: current.integration.credentialGeneration,
        },
      };
    });
  }

  async saveCalendarSyncPage(
    input: SaveCalendarSyncPageInput,
  ): Promise<boolean | 'continue'> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const now = await this.databaseNow(tx);
          const binding = await tx.calendarBinding.findUnique({
            where: { id: input.bindingId },
            include: { integration: true },
          });

          if (
            !binding ||
            binding.leaseOwner !== input.owner ||
            binding.leaseEpoch !== input.leaseEpoch ||
            !binding.leaseExpiresAt ||
            binding.leaseExpiresAt <= now ||
            binding.integration.status !== 'connected' ||
            binding.integration.activeBindingId !== binding.id ||
            binding.integration.connectionGeneration !==
              input.connectionGeneration
          )
            return false;

          if (input.fullImportGeneration !== binding.fullImportGeneration)
            return false;
          if (!input.nextPageToken && !input.nextSyncToken)
            throw new Error(
              'Final Google Calendar page did not include a sync token.',
            );

          const databaseTimedInput = { ...input, now };
          const providerEventIds = Array.from(
            new Set(
              input.events
                .filter((inbound) => inbound.status !== 'cancelled')
                .map((inbound) => inbound.googleEventId),
            ),
          );

          const legacyCandidates = providerEventIds.length
            ? await tx.calendarEvent.findMany({
                where: {
                  userId: binding.integration.userId,
                  provider: 'google',
                  providerEventId: { in: providerEventIds },
                  syncState: 'reconnect_required',
                  syncErrorCode: 'legacy_link_unverified',
                  providerLink: { is: null },
                },
                orderBy: { id: 'asc' },
                take: MAX_LEGACY_EVENT_CANDIDATES_PER_PAGE + 1,
                select: eventSelect,
              })
            : [];

          const legacyCandidatesByProviderId = new Map<string, EventRow[]>();

          if (legacyCandidates.length > MAX_LEGACY_EVENT_CANDIDATES_PER_PAGE)
            throw new Error(
              'Calendar page has too many legacy event candidates to reconcile safely.',
            );

          for (const candidate of legacyCandidates) {
            if (!candidate.providerEventId) continue;
            const candidates =
              legacyCandidatesByProviderId.get(candidate.providerEventId) ?? [];

            candidates.push(candidate);
            legacyCandidatesByProviderId.set(
              candidate.providerEventId,
              candidates,
            );
          }

          for (const inbound of input.events)
            await this.applyInboundEvent(
              tx,
              binding,
              inbound,
              databaseTimedInput,
              legacyCandidatesByProviderId,
            );

          const isFinalPage = input.nextPageToken === null;
          const finalizationCursor =
            isFinalPage && input.fullImport
              ? await this.cancelMissingFullImportEvents(
                  tx,
                  binding,
                  databaseTimedInput,
                )
              : null;

          const needsFinalization = finalizationCursor !== null;
          const nextSyncToken =
            binding.pendingFullImportSyncToken ?? input.nextSyncToken;

          const commitNow = await this.databaseNow(tx);
          const dirtyDuringImport =
            binding.dirtyRevision > input.capturedDirtyRevision;

          const committed = await tx.calendarBinding.updateMany({
            where: {
              id: input.bindingId,
              leaseOwner: input.owner,
              leaseEpoch: input.leaseEpoch,
              leaseExpiresAt: { gt: commitNow },
              dirtyRevision: binding.dirtyRevision,
              fullImportGeneration: input.fullImportGeneration,
              integration: {
                is: {
                  status: 'connected',
                  activeBindingId: input.bindingId,
                  connectionGeneration: input.connectionGeneration,
                },
              },
            },
            data: {
              nextPageToken: input.nextPageToken,
              ...(needsFinalization
                ? {
                    pendingFullImportSyncToken: nextSyncToken,
                    fullImportFinalizationCursor: finalizationCursor,
                    nextSyncAt: commitNow,
                  }
                : isFinalPage
                  ? {
                      syncToken: nextSyncToken,
                      pendingFullImportSyncToken: null,
                      fullImportFinalizationCursor: null,
                      pullTargetRevision: 0,
                      syncedRevision: input.capturedDirtyRevision,
                      state: 'active',
                      lastSyncedAt: commitNow,
                      nextSyncAt: new Date(
                        commitNow.getTime() +
                          (dirtyDuringImport ? 0 : CALENDAR_POLL_INTERVAL_MS),
                      ),
                      lastErrorCode: null,
                      lastErrorMessage: null,
                    }
                  : { nextSyncAt: commitNow }),
              leaseOwner: null,
              leaseExpiresAt: null,
            },
          });

          if (committed.count !== 1) throw new CalendarSyncLeaseLostError();

          return needsFinalization ? 'continue' : true;
        },
        { timeout: 20_000 },
      );
    } catch (error) {
      if (error instanceof CalendarSyncLeaseLostError) return false;
      throw error;
    }
  }

  async resetExpiredSyncToken(input: {
    bindingId: string;
    connectionGeneration: number;
    owner: string;
    leaseEpoch: number;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const now = await this.databaseNow(tx);
      const binding = await tx.calendarBinding.findUnique({
        where: { id: input.bindingId },
        include: { integration: true },
      });

      if (
        !binding ||
        binding.leaseOwner !== input.owner ||
        binding.leaseEpoch !== input.leaseEpoch ||
        !binding.leaseExpiresAt ||
        binding.leaseExpiresAt <= now ||
        binding.integration.status !== 'connected' ||
        binding.integration.activeBindingId !== binding.id ||
        binding.integration.connectionGeneration !== input.connectionGeneration
      )
        return false;

      const commitNow = await this.databaseNow(tx);
      const reset = await tx.calendarBinding.updateMany({
        where: {
          id: input.bindingId,
          leaseOwner: input.owner,
          leaseEpoch: input.leaseEpoch,
          leaseExpiresAt: { gt: commitNow },
        },
        data: {
          syncToken: null,
          nextPageToken: null,
          pendingFullImportSyncToken: null,
          fullImportFinalizationCursor: null,
          pullTargetRevision: 0,
          fullImportGeneration: { increment: 1 },
          nextSyncAt: commitNow,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });

      return reset.count === 1;
    });
  }

  async requestFullResync(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.lockUser(tx, userId)))
        return { status: 'missing' } as const;

      const integration = await tx.calendarIntegration.findFirst({
        where: {
          userId,
          provider: 'google',
          status: 'connected',
          accessToken: { not: null },
        },
        select: {
          activeBindingId: true,
          connectionGeneration: true,
          activeBinding: {
            select: {
              id: true,
              state: true,
              leaseExpiresAt: true,
              fullImportGeneration: true,
            },
          },
        },
      });

      const binding = integration?.activeBinding;

      if (
        !integration ||
        !binding ||
        integration.activeBindingId !== binding.id ||
        !['active', 'initializing'].includes(binding.state)
      )
        return { status: 'not_ready' } as const;

      const now = await this.databaseNow(tx);
      if (binding.leaseExpiresAt && binding.leaseExpiresAt > now)
        return { status: 'busy' } as const;

      const changed = await tx.calendarBinding.updateMany({
        where: {
          id: binding.id,
          state: { in: ['active', 'initializing'] },
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
          integration: {
            is: {
              status: 'connected',
              activeBindingId: binding.id,
              connectionGeneration: integration.connectionGeneration,
            },
          },
        },
        data: {
          state: 'initializing',
          syncToken: null,
          nextPageToken: null,
          pendingFullImportSyncToken: null,
          fullImportFinalizationCursor: null,
          pullTargetRevision: 0,
          fullImportGeneration: { increment: 1 },
          nextSyncAt: now,
          lastErrorCode: null,
          lastErrorMessage: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          leaseEpoch: { increment: 1 },
        },
      });

      if (changed.count !== 1) return { status: 'busy' } as const;

      return {
        status: 'queued',
        bindingId: binding.id,
        connectionGeneration: integration.connectionGeneration,
        fullImportGeneration: binding.fullImportGeneration + 1,
      } as const;
    });
  }

  async dueBindingIds(
    limit: number,
  ): Promise<Array<{ id: string; connectionGeneration: number }>> {
    const now = await this.databaseNow();
    const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 100));
    const rows = await this.prisma.calendarBinding.findMany({
      where: {
        state: { in: ['active', 'initializing'] },
        integration: { is: { status: 'connected' } },
        OR: [{ nextSyncAt: { lte: now } }],
        AND: [
          { OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }] },
        ],
      },
      orderBy: [{ nextSyncAt: 'asc' }, { updatedAt: 'asc' }],
      take: boundedLimit,
      select: {
        id: true,
        integration: { select: { connectionGeneration: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      connectionGeneration: row.integration.connectionGeneration,
    }));
  }

  async failBindingSync(input: {
    bindingId: string;
    connectionGeneration: number;
    owner: string;
    leaseEpoch: number;
    errorCode: string;
    outcome: 'retry' | 'deferred' | 'reconnect_required' | 'failed';
    retryDelayMs: number;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const now = await this.databaseNow(tx);
      const binding = await tx.calendarBinding.findUnique({
        where: { id: input.bindingId },
        include: { integration: true },
      });

      if (
        !binding ||
        binding.leaseOwner !== input.owner ||
        binding.leaseEpoch !== input.leaseEpoch ||
        !binding.leaseExpiresAt ||
        binding.leaseExpiresAt <= now ||
        binding.integration.connectionGeneration !==
          input.connectionGeneration ||
        binding.integration.activeBindingId !== binding.id
      )
        return false;

      const commitNow = await this.databaseNow(tx);
      const changed = await tx.calendarBinding.updateMany({
        where: {
          id: input.bindingId,
          leaseOwner: input.owner,
          leaseEpoch: input.leaseEpoch,
          leaseExpiresAt: { gt: commitNow },
          integration: {
            is: {
              connectionGeneration: input.connectionGeneration,
              activeBindingId: input.bindingId,
            },
          },
        },
        data: {
          ...(input.outcome === 'reconnect_required'
            ? { state: 'paused', leaseEpoch: { increment: 1 } }
            : {}),
          leaseOwner: null,
          leaseExpiresAt: null,
          nextSyncAt: this.retryAt(commitNow, input.retryDelayMs),
          lastErrorCode: input.outcome === 'deferred' ? null : input.errorCode,
          lastErrorMessage:
            input.outcome === 'deferred' ? null : input.errorCode,
        },
      });

      if (changed.count !== 1) return false;

      if (input.outcome === 'reconnect_required') {
        const integrationUpdated = await tx.calendarIntegration.updateMany({
          where: {
            id: binding.integrationId,
            connectionGeneration: input.connectionGeneration,
            activeBindingId: binding.id,
          },
          data: { status: 'reconnect_required' },
        });

        if (integrationUpdated.count !== 1)
          throw new Error(
            'Calendar integration changed while pausing its failed binding.',
          );
      }

      return true;
    });
  }

  async releaseBindingSyncLease(
    bindingId: string,
    owner: string,
    leaseEpoch: number,
  ): Promise<boolean> {
    const result = await this.prisma.calendarBinding.updateMany({
      where: {
        id: bindingId,
        leaseOwner: owner,
        leaseEpoch,
      },
      data: { leaseOwner: null, leaseExpiresAt: null },
    });

    return result.count === 1;
  }

  async dueWatchBindingIds(
    limit: number,
  ): Promise<Array<{ id: string; connectionGeneration: number }>> {
    const now = await this.databaseNow();
    const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 100));
    const renewBefore = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return this.prisma.$queryRaw<
      Array<{ id: string; connectionGeneration: number }>
    >(Prisma.sql`
      SELECT binding.id, integration."connectionGeneration"
      FROM "calendar_binding" AS binding
      INNER JOIN "calendar_integration" AS integration
        ON integration.id = binding."integrationId"
      WHERE binding.state = 'active'
        AND integration.status = 'connected'
        AND integration."activeBindingId" = binding.id
        AND NOT EXISTS (
          SELECT 1
          FROM "calendar_watch_channel" AS channel
          WHERE channel."bindingId" = binding.id
            AND channel."connectionGeneration" = integration."connectionGeneration"
            AND channel."stoppedAt" IS NULL
            AND (
              (channel.state = 'registering' AND channel."expiresAt" > ${now})
              OR (channel.state = 'active' AND channel."expiresAt" > ${renewBefore})
            )
        )
      ORDER BY binding."updatedAt" ASC, binding.id ASC
      LIMIT ${boundedLimit}
    `);
  }

  async createWatchChannel(input: {
    bindingId: string;
    connectionGeneration: number;
    channelId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const owner = await tx.calendarBinding.findUnique({
        where: { id: input.bindingId },
        select: { integration: { select: { userId: true } } },
      });

      if (!owner || !(await this.lockUser(tx, owner.integration.userId)))
        return false;

      const binding = await tx.calendarBinding.findUnique({
        where: { id: input.bindingId },
        include: { integration: true },
      });

      if (
        !binding ||
        binding.state !== 'active' ||
        binding.integration.status !== 'connected' ||
        binding.integration.activeBindingId !== binding.id ||
        binding.integration.connectionGeneration !== input.connectionGeneration
      )
        return false;

      await tx.calendarWatchChannel.create({
        data: {
          bindingId: input.bindingId,
          connectionGeneration: input.connectionGeneration,
          channelId: input.channelId,
          tokenHash: input.tokenHash,
          state: 'registering',
          expiresAt: input.expiresAt,
        },
      });

      return true;
    });
  }

  async activateWatchChannel(input: {
    bindingId: string;
    channelId: string;
    connectionGeneration: number;
    resourceId: string;
    resourceUri: string | null;
    expiresAt: Date | null;
  }): Promise<boolean> {
    const result = await this.prisma.calendarWatchChannel.updateMany({
      where: {
        channelId: input.channelId,
        bindingId: input.bindingId,
        connectionGeneration: input.connectionGeneration,
        state: 'registering',
        binding: {
          is: {
            state: 'active',
            integration: {
              is: {
                status: 'connected',
                activeBindingId: input.bindingId,
                connectionGeneration: input.connectionGeneration,
              },
            },
          },
        },
      },
      data: {
        state: 'active',
        resourceId: input.resourceId,
        resourceUri: input.resourceUri,
        expiresAt: input.expiresAt,
      },
    });

    return result.count === 1;
  }

  async failWatchChannel(channelId: string, errorCode: string): Promise<void> {
    await this.prisma.calendarWatchChannel.updateMany({
      where: { channelId, state: 'registering' },
      data: { state: `failed:${errorCode}`, stoppedAt: new Date() },
    });
  }

  async activeWatchChannels(
    bindingId: string,
  ): Promise<Array<{ channelId: string; resourceId: string | null }>> {
    return this.prisma.calendarWatchChannel.findMany({
      where: { bindingId, state: 'active', stoppedAt: null },
      select: { channelId: true, resourceId: true },
    });
  }

  async markWatchChannelStopped(channelId: string): Promise<void> {
    await this.prisma.calendarWatchChannel.updateMany({
      where: { channelId, stoppedAt: null },
      data: {
        state: 'stopped',
        stoppedAt: new Date(),
        cleanupRequestedAt: null,
      },
    });
  }

  async markWatchCleanupPending(channelId: string): Promise<void> {
    const now = await this.databaseNow();
    await this.prisma.calendarWatchChannel.updateMany({
      where: { channelId, stoppedAt: null, cleanupRequestedAt: null },
      data: { state: 'cleanup_pending', cleanupRequestedAt: now },
    });
  }

  async markWatchDirtyNotification(input: {
    channelId: string;
    tokenHash: string;
    resourceId: string;
    messageNumber: string;
  }): Promise<
    | { accepted: true; bindingId: string; connectionGeneration: number }
    | { accepted: false }
  > {
    if (!/^\d+$/.test(input.messageNumber)) return { accepted: false };
    const messageNumber = BigInt(input.messageNumber);

    return this.prisma.$transaction(async (tx) => {
      const now = await this.databaseNow(tx);
      const channel = await tx.calendarWatchChannel.findUnique({
        where: { channelId: input.channelId },
        include: { binding: { include: { integration: true } } },
      });

      if (
        !channel ||
        !['registering', 'active'].includes(channel.state) ||
        channel.stoppedAt ||
        (channel.expiresAt !== null && channel.expiresAt <= now) ||
        (channel.resourceId !== null &&
          channel.resourceId !== input.resourceId) ||
        !this.sameHash(channel.tokenHash, input.tokenHash) ||
        channel.connectionGeneration !==
          channel.binding.integration.connectionGeneration ||
        channel.binding.state !== 'active' ||
        channel.binding.integration.status !== 'connected' ||
        channel.binding.integration.activeBindingId !== channel.bindingId
      )
        return { accepted: false };
      if (
        channel.lastMessageNumber !== null &&
        messageNumber <= channel.lastMessageNumber
      )
        return { accepted: false };

      const advanced = await tx.calendarWatchChannel.updateMany({
        where: {
          id: channel.id,
          OR: [
            { lastMessageNumber: null },
            { lastMessageNumber: { lt: messageNumber } },
          ],
        },
        data: {
          lastMessageNumber: messageNumber,
          ...(channel.resourceId === null
            ? { resourceId: input.resourceId }
            : {}),
        },
      });

      if (advanced.count !== 1) return { accepted: false };

      const dirtied = await tx.calendarBinding.updateMany({
        where: {
          id: channel.bindingId,
          state: 'active',
          integration: {
            is: {
              status: 'connected',
              activeBindingId: channel.bindingId,
              connectionGeneration: channel.connectionGeneration,
            },
          },
        },
        data: {
          dirtyRevision: { increment: 1 },
          nextSyncAt: now,
        },
      });

      if (dirtied.count !== 1) return { accepted: false };

      return {
        accepted: true,
        bindingId: channel.bindingId,
        connectionGeneration: channel.connectionGeneration,
      };
    });
  }

  private sameHash(expectedHex: string, receivedHex: string): boolean {
    const expected = Buffer.from(expectedHex, 'hex');
    const received = Buffer.from(receivedHex, 'hex');

    return (
      expected.length > 0 &&
      expected.length === received.length &&
      timingSafeEqual(expected, received)
    );
  }

  private async applyInboundEvent(
    tx: Transaction,
    binding: {
      id: string;
      integration: { userId: string };
      fullImportGeneration: number;
    },
    inbound: CalendarInboundEventInput,
    input: DatabaseTimedCalendarSyncPageInput,
    legacyCandidatesByProviderId: ReadonlyMap<string, EventRow[]>,
  ): Promise<void> {
    const rawSnapshot = inputJsonObject(inbound.rawSnapshot);
    const remoteCommon = commonSnapshot(inbound.commonSnapshot);
    let link = await tx.calendarEventLink.findUnique({
      where: {
        bindingId_googleEventId: {
          bindingId: binding.id,
          googleEventId: inbound.googleEventId,
        },
      },
    });

    if (!link && inbound.status === 'cancelled') {
      if (
        inbound.recurringParentProviderEventId &&
        (inbound.originalStartAt || inbound.originalStartDate)
      ) {
        await tx.calendarEventLink.create({
          data: {
            bindingId: binding.id,
            googleEventId: inbound.googleEventId,
            recurringParentProviderEventId:
              inbound.recurringParentProviderEventId,
            originalStartAt: inbound.originalStartAt,
            originalStartDate: inbound.originalStartDate,
            etag: inbound.etag,
            remoteSnapshot: rawSnapshot,
            commonSnapshot: remoteCommon,
            tombstoneAt: input.now,
            lastSeenFullImportGeneration: input.fullImportGeneration,
          },
        });
      }

      return;
    }

    if (!link) {
      if (!inbound.event)
        throw new Error(
          'Google Calendar returned an active event without event data.',
        );

      const candidates = legacyCandidatesByProviderId.get(
        inbound.googleEventId,
      );

      const legacyEvent = candidates?.length === 1 ? candidates[0] : undefined;

      if (legacyEvent) {
        const legacySnapshot = snapshotRecord(
          commonSnapshot(eventPayload(legacyEvent)),
        );

        const remoteSnapshot = snapshotRecord(remoteCommon);
        const changedFields = snapshotChangedFields(
          legacySnapshot,
          remoteSnapshot,
        );

        if (changedFields.length === 0) {
          const linked = await tx.calendarEvent.updateMany({
            where: {
              id: legacyEvent.id,
              userId: binding.integration.userId,
              revision: legacyEvent.revision,
              syncState: 'reconnect_required',
              syncErrorCode: 'legacy_link_unverified',
              providerLink: { is: null },
            },
            data: {
              syncState: 'synced',
              syncErrorCode: null,
              lastSyncedAt: input.now,
            },
          });

          if (linked.count !== 1)
            throw new Error(
              'Legacy Google event changed during binding reconciliation.',
            );

          await tx.calendarEventLink.create({
            data: {
              bindingId: binding.id,
              calendarEventId: legacyEvent.id,
              googleEventId: inbound.googleEventId,
              recurringParentProviderEventId:
                inbound.recurringParentProviderEventId,
              originalStartAt: inbound.originalStartAt,
              originalStartDate: inbound.originalStartDate,
              etag: inbound.etag,
              remoteSnapshot: rawSnapshot,
              commonSnapshot: remoteCommon,
              syncedRevision: legacyEvent.revision,
              lastSeenFullImportGeneration: input.fullImportGeneration,
            },
          });

          return;
        }
      }

      const created = await tx.calendarEvent.create({
        data: {
          userId: binding.integration.userId,
          ...inbound.event,
          provider: 'google',
          providerEventId: inbound.googleEventId,
          status: inbound.status,
          syncState: 'synced',
          revision: 1,
          recurringParentProviderEventId:
            inbound.recurringParentProviderEventId,
          originalStartAt: inbound.originalStartAt,
          originalStartDate: inbound.originalStartDate,
        },
        select: eventSelect,
      });

      await tx.calendarEventLink.create({
        data: {
          bindingId: binding.id,
          calendarEventId: created.id,
          googleEventId: inbound.googleEventId,
          recurringParentProviderEventId:
            inbound.recurringParentProviderEventId,
          originalStartAt: inbound.originalStartAt,
          originalStartDate: inbound.originalStartDate,
          etag: inbound.etag,
          remoteSnapshot: rawSnapshot,
          commonSnapshot: remoteCommon,
          syncedRevision: created.revision,
          lastSeenFullImportGeneration: input.fullImportGeneration,
        },
      });

      return;
    }

    if (!link.calendarEventId) {
      if (inbound.status === 'cancelled') {
        await tx.calendarEventLink.update({
          where: { id: link.id },
          data: {
            etag: inbound.etag,
            remoteSnapshot: rawSnapshot,
            commonSnapshot: remoteCommon,
            tombstoneAt: input.now,
            lastSeenFullImportGeneration: input.fullImportGeneration,
          },
        });

        return;
      }

      if (!inbound.event)
        throw new Error(
          'Google Calendar returned an active event without event data.',
        );
      const restored = await tx.calendarEvent.create({
        data: {
          userId: binding.integration.userId,
          ...inbound.event,
          provider: 'google',
          providerEventId: inbound.googleEventId,
          status: inbound.status,
          syncState: 'synced',
          revision: 1,
          recurringParentProviderEventId:
            inbound.recurringParentProviderEventId,
          originalStartAt: inbound.originalStartAt,
          originalStartDate: inbound.originalStartDate,
        },
        select: eventSelect,
      });

      link = await tx.calendarEventLink.update({
        where: { id: link.id },
        data: {
          calendarEventId: restored.id,
          etag: inbound.etag,
          remoteSnapshot: rawSnapshot,
          commonSnapshot: remoteCommon,
          syncedRevision: restored.revision,
          tombstoneAt: null,
          lastSeenFullImportGeneration: input.fullImportGeneration,
        },
      });

      return;
    }

    const current = await tx.calendarEvent.findUnique({
      where: { id: link.calendarEventId },
      select: eventSelect,
    });

    if (!current) {
      await tx.calendarEventLink.update({
        where: { id: link.id },
        data: {
          calendarEventId: null,
          etag: inbound.etag,
          remoteSnapshot: rawSnapshot,
          commonSnapshot: remoteCommon,
          tombstoneAt: inbound.status === 'cancelled' ? input.now : null,
          lastSeenFullImportGeneration: input.fullImportGeneration,
        },
      });

      return;
    }

    const localPayload = eventPayload(current);
    const localCommon = snapshotRecord(commonSnapshot(localPayload));
    const baseCommon = link.commonSnapshot
      ? snapshotRecord(link.commonSnapshot)
      : snapshotRecord(remoteCommon);

    const remote = snapshotRecord(remoteCommon);
    const localDirty =
      current.syncState === 'pending' ||
      current.revision > (link.syncedRevision ?? current.revision);

    if (current.syncState === 'conflict') {
      const latestConflict = await tx.calendarSyncConflict.findFirst({
        where: { eventLinkId: link.id, state: 'open' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });

      const conflictingFields =
        inbound.status === 'cancelled'
          ? ['status']
          : snapshotConflictingGroups(baseCommon, localCommon, remote);

      if (latestConflict) {
        await tx.calendarSyncConflict.update({
          where: { id: latestConflict.id },
          data: {
            localRevision: current.revision,
            localSnapshot: inputJsonObject(localPayload),
            remoteSnapshot: conflictRemoteSnapshot(
              inbound.rawSnapshot,
              remoteCommon,
            ),
            conflictingFields,
          },
        });
      } else {
        await tx.calendarSyncConflict.create({
          data: {
            bindingId: binding.id,
            eventLinkId: link.id,
            localRevision: current.revision,
            baseSnapshot: link.commonSnapshot ?? Prisma.JsonNull,
            localSnapshot: inputJsonObject(localPayload),
            remoteSnapshot: conflictRemoteSnapshot(
              inbound.rawSnapshot,
              remoteCommon,
            ),
            conflictingFields,
          },
        });
      }

      await tx.calendarEventLink.update({
        where: { id: link.id },
        data: {
          etag: inbound.etag,
          remoteSnapshot: rawSnapshot,
          tombstoneAt: inbound.status === 'cancelled' ? input.now : null,
          lastSeenFullImportGeneration: input.fullImportGeneration,
        },
      });
      await tx.calendarSyncOperation.updateMany({
        where: {
          bindingId: binding.id,
          calendarEventId: current.id,
          state: 'pending',
        },
        data: { state: 'conflict', claimToken: null, claimedUntil: null },
      });

      return;
    }

    if (inbound.status === 'cancelled') {
      if (localDirty && current.status !== 'cancelled') {
        await tx.calendarSyncConflict.create({
          data: {
            bindingId: binding.id,
            eventLinkId: link.id,
            localRevision: current.revision,
            baseSnapshot: link.commonSnapshot ?? Prisma.JsonNull,
            localSnapshot: inputJsonObject(localPayload),
            remoteSnapshot: conflictRemoteSnapshot(
              inbound.rawSnapshot,
              remoteCommon,
            ),
            conflictingFields: ['status'],
          },
        });
        await tx.calendarEvent.update({
          where: { id: current.id },
          data: { syncState: 'conflict', syncErrorCode: 'remote_deleted' },
        });
        await tx.calendarSyncOperation.updateMany({
          where: {
            bindingId: binding.id,
            calendarEventId: current.id,
            state: 'pending',
          },
          data: { state: 'conflict', claimToken: null, claimedUntil: null },
        });
      } else {
        const revision =
          current.revision + (current.status === 'cancelled' ? 0 : 1);

        await tx.calendarEvent.update({
          where: { id: current.id },
          data: {
            status: 'cancelled',
            syncState: 'synced',
            syncErrorCode: null,
            revision,
          },
        });
        await tx.calendarEventLink.update({
          where: { id: link.id },
          data: {
            etag: inbound.etag,
            remoteSnapshot: rawSnapshot,
            commonSnapshot: remoteCommon,
            syncedRevision: revision,
            tombstoneAt: input.now,
            lastSeenFullImportGeneration: input.fullImportGeneration,
          },
        });
      }

      return;
    }

    const remoteChanged = snapshotChangedFields(baseCommon, remote);

    if (!localDirty) {
      const nextRevision =
        current.revision + (remoteChanged.length > 0 ? 1 : 0);

      await tx.calendarEvent.update({
        where: { id: current.id },
        data: {
          ...eventDataFromSnapshot(remote, inbound),
          provider: 'google',
          providerEventId: inbound.googleEventId,
          syncState: 'synced',
          syncErrorCode: null,
          revision: nextRevision,
          lastSyncedAt: input.now,
        },
      });
      await tx.calendarEventLink.update({
        where: { id: link.id },
        data: {
          etag: inbound.etag,
          remoteSnapshot: rawSnapshot,
          commonSnapshot: remoteCommon,
          syncedRevision: nextRevision,
          tombstoneAt: null,
          lastSeenFullImportGeneration: input.fullImportGeneration,
        },
      });

      return;
    }

    const localChanged = snapshotChangedFields(baseCommon, localCommon);
    const conflictingFields = snapshotConflictingGroups(
      baseCommon,
      localCommon,
      remote,
    );

    if (conflictingFields.length > 0) {
      await tx.calendarSyncConflict.create({
        data: {
          bindingId: binding.id,
          eventLinkId: link.id,
          localRevision: current.revision,
          baseSnapshot: link.commonSnapshot ?? Prisma.JsonNull,
          localSnapshot: inputJsonObject(localPayload),
          remoteSnapshot: conflictRemoteSnapshot(
            inbound.rawSnapshot,
            remoteCommon,
          ),
          conflictingFields,
        },
      });
      await tx.calendarEvent.update({
        where: { id: current.id },
        data: { syncState: 'conflict', syncErrorCode: 'simultaneous_edit' },
      });
      await tx.calendarSyncOperation.updateMany({
        where: {
          bindingId: binding.id,
          calendarEventId: current.id,
          state: 'pending',
        },
        data: { state: 'conflict', claimToken: null, claimedUntil: null },
      });
      await tx.calendarEventLink.update({
        where: { id: link.id },
        data: {
          etag: inbound.etag,
          remoteSnapshot: rawSnapshot,
          lastSeenFullImportGeneration: input.fullImportGeneration,
        },
      });

      return;
    }

    const localTimeChanged = CALENDAR_TIME_FIELDS.some((field) =>
      localChanged.includes(field),
    );

    const merged = Object.fromEntries(
      SYNCED_EVENT_FIELDS.map((field) => [
        field,
        (
          CALENDAR_TIME_FIELDS.some((timeField) => timeField === field)
            ? localTimeChanged
            : localChanged.includes(field)
        )
          ? localCommon[field]
          : remote[field],
      ]),
    );

    const mergedDiffersFromRemote =
      snapshotChangedFields(merged, remote).length > 0;

    const revision = current.revision + (remoteChanged.length > 0 ? 1 : 0);
    const updated = await tx.calendarEvent.update({
      where: { id: current.id },
      data: {
        ...eventDataFromSnapshot(merged, inbound),
        provider: 'google',
        providerEventId: inbound.googleEventId,
        syncState: mergedDiffersFromRemote ? 'pending' : 'synced',
        syncErrorCode: null,
        revision,
        ...(mergedDiffersFromRemote ? {} : { lastSyncedAt: input.now }),
      },
      select: eventSelect,
    });

    await tx.calendarEventLink.update({
      where: { id: link.id },
      data: {
        etag: inbound.etag,
        remoteSnapshot: rawSnapshot,
        commonSnapshot: remoteCommon,
        ...(mergedDiffersFromRemote ? {} : { syncedRevision: revision }),
        tombstoneAt: null,
        lastSeenFullImportGeneration: input.fullImportGeneration,
      },
    });

    if (mergedDiffersFromRemote) {
      const pending = await tx.calendarSyncOperation.findFirst({
        where: {
          bindingId: binding.id,
          calendarEventId: current.id,
          eventRevision: revision,
          state: { in: ['pending', 'processing'] },
        },
        select: { id: true },
      });

      if (!pending) {
        await this.createOperation(
          tx,
          binding.integration.userId,
          event(updated),
          'update',
          {
            bindingId: binding.id,
            connectionGeneration: input.connectionGeneration,
          },
          {
            key: `inbound:${binding.id}:${inbound.googleEventId}:${inbound.etag ?? 'no-etag'}:${revision}`,
            fingerprint: '',
            expiresAt: new Date(input.now.getTime() + 48 * 60 * 60 * 1000),
          },
          remoteCommon,
        );
      }
    }
  }

  private async cancelMissingFullImportEvents(
    tx: Transaction,
    binding: {
      id: string;
      integration: { userId: string };
      fullImportGeneration: number;
      fullImportFinalizationCursor: string | null;
    },
    input: DatabaseTimedCalendarSyncPageInput,
  ): Promise<string | null> {
    const unseen = await tx.calendarEventLink.findMany({
      where: {
        bindingId: binding.id,
        ...(binding.fullImportFinalizationCursor
          ? { id: { gt: binding.fullImportFinalizationCursor } }
          : {}),
        calendarEventId: { not: null },
        tombstoneAt: null,
        OR: [
          { lastSeenFullImportGeneration: null },
          { lastSeenFullImportGeneration: { not: input.fullImportGeneration } },
        ],
      },
      orderBy: { id: 'asc' },
      take: FULL_IMPORT_FINALIZATION_BATCH_SIZE + 1,
    });

    for (const link of unseen.slice(0, FULL_IMPORT_FINALIZATION_BATCH_SIZE)) {
      await this.applyInboundEvent(
        tx,
        binding,
        {
          googleEventId: link.googleEventId,
          etag: null,
          rawSnapshot: {
            id: link.googleEventId,
            status: 'cancelled',
            deleted: true,
          },
          commonSnapshot: { status: 'cancelled' },
          event: null,
          status: 'cancelled',
          recurringParentProviderEventId: link.recurringParentProviderEventId,
          originalStartAt: link.originalStartAt,
          originalStartDate: link.originalStartDate,
        },
        input,
        new Map(),
      );
    }

    return unseen.length > FULL_IMPORT_FINALIZATION_BATCH_SIZE
      ? unseen[FULL_IMPORT_FINALIZATION_BATCH_SIZE - 1]!.id
      : null;
  }
}
