import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  CALENDAR_REPOSITORY,
  type CalendarBindingSyncClaim,
  type CalendarRequestFence,
  type CalendarInboundEventInput,
  type CalendarSyncOperationClaim,
  type FailCalendarSyncOperation,
  type ICalendarRepository,
} from '../../database/interfaces';
import type {
  CalendarEvent,
  CalendarEventWrite,
} from '../../database/entities';
import { calendarSyncMetrics } from '../../infra/calendar/calendar-sync.metrics';
import {
  GoogleCalendarAdmissionUnavailableError,
  GoogleCalendarApiError,
  GoogleCalendarRequestDeferredError,
  GoogleCalendarRequestFencedError,
  GoogleCalendarService,
  type GoogleCalendarRequestContext,
  type GoogleCalendarRequestLane,
  type GoogleEventResource,
} from '../../infra/calendar';
import { QueueService, type CalendarSyncJob } from '../../infra/queue';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { reconcileCalendarUpdate } from './calendar-update-reconciliation';

class CalendarUpdateConflictError extends Error {
  constructor(
    readonly inbound: CalendarInboundEventInput,
    readonly fields: string[],
  ) {
    super('The requested calendar fields changed at Google.');
    this.name = 'calendar_update_conflict';
  }
}

class CalendarVersionChangedError extends Error {
  constructor() {
    super('Google changed independently during the conditional update.');
    this.name = 'calendar_version_changed';
  }
}

const OPERATION_LEASE_MS = 90_000;
// Cover the transport's 15-second timeout plus five seconds of request overhead.
const REQUEST_MIN_LEASE_MS = 20_000;
const CREDENTIAL_LEASE_MS = 30_000;
const TOKEN_MIN_VALIDITY_MS = 60_000;
const RECOVERY_BATCH_SIZE = 100;
const MAX_RETRY_MS = 6 * 60 * 60 * 1000;
const BINDING_RETRY_MS = 30_000;
const DEFAULT_OPERATION_RETRY_ATTEMPTS = 8;
const DEFAULT_OPERATION_RETRY_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_OPERATION_RETRY_DELAY_MS = 15 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`Calendar sync payload is missing ${field}.`);

  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseDate(value: unknown, field: string): Date {
  if (typeof value !== 'string')
    throw new Error(`Calendar sync payload is missing ${field}.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new Error(`Calendar sync payload has an invalid ${field}.`);

  return date;
}

function parseEventWrite(value: unknown): CalendarEventWrite {
  if (!isRecord(value))
    throw new Error('Calendar sync payload is not an object.');
  const common: Pick<
    CalendarEventWrite,
    'title' | 'status' | 'description' | 'location' | 'recurrence' | 'attendees'
  > = {
    title: requiredString(value.title, 'title'),
    ...(value.status === 'confirmed' || value.status === 'tentative'
      ? { status: value.status }
      : {}),
    ...(typeof value.description === 'string' || value.description === null
      ? { description: value.description }
      : {}),
    ...(typeof value.location === 'string' || value.location === null
      ? { location: value.location }
      : {}),
    ...(Array.isArray(value.recurrence) &&
    value.recurrence.every((item) => typeof item === 'string')
      ? { recurrence: value.recurrence }
      : {}),
    ...(Array.isArray(value.attendees) &&
    value.attendees.every((item) => typeof item === 'string')
      ? { attendees: value.attendees }
      : {}),
  };

  if (typeof value.allDayStartDate === 'string') {
    return {
      ...common,
      allDayStartDate: parseDate(value.allDayStartDate, 'allDayStartDate'),
      allDayEndDate: parseDate(value.allDayEndDate, 'allDayEndDate'),
      ...(typeof value.timezone === 'string'
        ? { timezone: value.timezone }
        : {}),
    };
  }

  return {
    ...common,
    startAt: parseDate(value.startAt, 'startAt'),
    endAt: parseDate(value.endAt, 'endAt'),
    timezone: requiredString(value.timezone, 'timezone'),
  };
}

function remoteId(resource: GoogleEventResource): string {
  return requiredString(resource.id, 'Google event id');
}

function parseGoogleDate(value: unknown, field: string): Date {
  if (typeof value !== 'string')
    throw new Error(`Google Calendar event is missing ${field}.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new Error(`Google Calendar event has an invalid ${field}.`);

  return parsed;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function occurrenceKeyKind(value: string): 'all_day' | 'timed' | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);

    return !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
      ? 'all_day'
      : null;
  }

  const date = new Date(value);

  return !Number.isNaN(date.getTime()) && date.toISOString() === value
    ? 'timed'
    : null;
}

function originalStartKey(resource: GoogleEventResource): string | null {
  if (!isRecord(resource.originalStartTime)) return null;
  const originalStart = resource.originalStartTime;

  if (typeof originalStart.date === 'string') return originalStart.date;
  if (typeof originalStart.dateTime !== 'string') return null;

  const date = new Date(originalStart.dateTime);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseInboundEvent(
  resource: GoogleEventResource,
  defaultTimezone: string,
): CalendarInboundEventInput {
  const googleEventId = remoteId(resource);
  const etag = optionalString(resource.etag);
  const cancelled = resource.status === 'cancelled';
  const start = isRecord(resource.start) ? resource.start : null;
  const end = isRecord(resource.end) ? resource.end : null;
  let event: CalendarEventWrite | null = null;
  let startAt: string | null = null;
  let endAt: string | null = null;
  let timezone: string | null = null;
  let allDayStartDate: string | null = null;
  let allDayEndDate: string | null = null;
  let recurrence: string[] = [];
  let attendees: string[] = [];
  let title: string | null = null;
  let description: string | null = null;
  let location: string | null = null;
  const status = cancelled
    ? 'cancelled'
    : resource.status === 'tentative'
      ? 'tentative'
      : 'confirmed';

  if (!cancelled) {
    if (!start || !end)
      throw new Error(
        'Active Google Calendar event is missing its date range.',
      );
    title =
      typeof resource.summary === 'string'
        ? resource.summary
        : 'Untitled event';
    description = nullableString(resource.description);
    location = nullableString(resource.location);
    recurrence = Array.isArray(resource.recurrence)
      ? resource.recurrence.filter(
          (item): item is string => typeof item === 'string',
        )
      : [];
    attendees = Array.isArray(resource.attendees)
      ? resource.attendees.flatMap((item) =>
          isRecord(item) && typeof item.email === 'string' ? [item.email] : [],
        )
      : [];

    if (typeof start.date === 'string' && typeof end.date === 'string') {
      const startDay = start.date;
      const endDay = end.date;
      const allDayStart = parseGoogleDate(
        `${startDay}T00:00:00.000Z`,
        'start.date',
      );

      const allDayEnd = parseGoogleDate(`${endDay}T00:00:00.000Z`, 'end.date');
      allDayStartDate = allDayStart.toISOString();
      allDayEndDate = allDayEnd.toISOString();
      event = {
        title,
        status: status === 'tentative' ? 'tentative' : 'confirmed',
        description,
        location,
        allDayStartDate: allDayStart,
        allDayEndDate: allDayEnd,
        recurrence,
        attendees,
      };
    } else if (
      typeof start.dateTime === 'string' &&
      typeof end.dateTime === 'string'
    ) {
      const startDate = parseGoogleDate(start.dateTime, 'start.dateTime');
      const endDate = parseGoogleDate(end.dateTime, 'end.dateTime');
      timezone =
        typeof start.timeZone === 'string' && start.timeZone
          ? start.timeZone
          : defaultTimezone;
      startAt = startDate.toISOString();
      endAt = endDate.toISOString();
      event = {
        title,
        status: status === 'tentative' ? 'tentative' : 'confirmed',
        description,
        location,
        startAt: startDate,
        endAt: endDate,
        timezone,
        recurrence,
        attendees,
      };
    } else {
      throw new Error(
        'Google Calendar event has mismatched timed or all-day dates.',
      );
    }
  }

  const originalStart = isRecord(resource.originalStartTime)
    ? resource.originalStartTime
    : null;

  const originalStartAt =
    originalStart && typeof originalStart.dateTime === 'string'
      ? parseGoogleDate(originalStart.dateTime, 'originalStartTime.dateTime')
      : null;

  const originalStartDate =
    originalStart && typeof originalStart.date === 'string'
      ? parseGoogleDate(
          `${originalStart.date}T00:00:00.000Z`,
          'originalStartTime.date',
        )
      : null;

  const recurringParentProviderEventId = optionalString(
    resource.recurringEventId,
  );

  const commonSnapshot = {
    title,
    description,
    location,
    startAt,
    endAt,
    timezone,
    allDayStartDate,
    allDayEndDate,
    recurrence,
    attendees,
    status,
  };

  return {
    googleEventId,
    etag,
    rawSnapshot: resource,
    commonSnapshot,
    event,
    status,
    recurringParentProviderEventId,
    originalStartAt,
    originalStartDate,
  };
}

function remoteEtag(resource: GoogleEventResource): string | null {
  return optionalString(resource.etag);
}

function isDuplicateCreate(error: unknown): boolean {
  return error instanceof GoogleCalendarApiError && error.httpStatus === 409;
}

function isPreconditionFailure(error: unknown): boolean {
  return error instanceof GoogleCalendarApiError && error.httpStatus === 412;
}

function isMissingRemoteEvent(error: unknown): boolean {
  return error instanceof GoogleCalendarApiError && error.httpStatus === 404;
}

function isReconnectError(error: unknown): boolean {
  return (
    error instanceof GoogleCalendarApiError &&
    (error.httpStatus === 401 ||
      (error.httpStatus === 400 && error.providerReason === 'invalid_grant'))
  );
}

function positiveIntegerConfig(
  config: ConfigService,
  key: string,
  defaultValue: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const raw = config.get<number | string>(key);
  const value = raw === undefined ? defaultValue : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new Error(
      `${key} must be a positive integer no greater than ${maximum}.`,
    );

  return value;
}

function retryDelayMs(
  attempts: number,
  error: unknown,
  maxDelayMs: number,
): number {
  if (error instanceof GoogleCalendarApiError && error.retryAfterMs !== null)
    return Math.max(1000, error.retryAfterMs);

  const exponent = Math.max(0, Math.min(attempts - 1, 12));
  const ceiling = Math.min(1000 * 2 ** exponent, maxDelayMs);

  return Math.floor(Math.random() * (ceiling + 1));
}

function errorCode(error: unknown): string {
  if (error instanceof GoogleCalendarRequestDeferredError)
    return 'calendar_quota_deferred';
  if (error instanceof GoogleCalendarAdmissionUnavailableError)
    return 'calendar_rate_limiter_unavailable';
  if (error instanceof GoogleCalendarApiError)
    return `google_${error.httpStatus}_${error.providerReason}`;
  if (error instanceof Error) return error.name || 'calendar_sync_error';

  return 'calendar_sync_error';
}

function isQuotaOrTransientGoogleError(error: GoogleCalendarApiError): boolean {
  return (
    error.httpStatus === 408 ||
    error.httpStatus === 429 ||
    error.httpStatus >= 500 ||
    (error.httpStatus === 403 &&
      ['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded'].includes(
        error.providerReason,
      ))
  );
}

function isTransientTransportError(error: unknown): boolean {
  return (
    error instanceof GoogleCalendarAdmissionUnavailableError ||
    error instanceof TypeError ||
    (error instanceof Error &&
      ['AbortError', 'TimeoutError', 'NetworkError'].includes(error.name))
  );
}

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);
  private readonly operationRetryAttempts: number;
  private readonly operationRetryAgeMs: number;
  private readonly operationRetryDelayMs: number;
  private readonly completedOperationRetentionDays: number;
  private readonly tombstoneRetentionDays: number;
  private readonly retentionBatchSize: number;

  constructor(
    @Inject(CALENDAR_REPOSITORY)
    private readonly calendars: ICalendarRepository,
    private readonly google: GoogleCalendarService,
    private readonly queues: QueueService,
    config: ConfigService,
  ) {
    this.operationRetryAttempts = positiveIntegerConfig(
      config,
      'BACKEND_GOOGLE_CALENDAR_RETRY_MAX_ATTEMPTS',
      DEFAULT_OPERATION_RETRY_ATTEMPTS,
    );
    this.operationRetryAgeMs = positiveIntegerConfig(
      config,
      'BACKEND_GOOGLE_CALENDAR_RETRY_MAX_AGE_MS',
      DEFAULT_OPERATION_RETRY_AGE_MS,
    );
    this.operationRetryDelayMs = positiveIntegerConfig(
      config,
      'BACKEND_GOOGLE_CALENDAR_RETRY_MAX_DELAY_MS',
      DEFAULT_OPERATION_RETRY_DELAY_MS,
    );
    this.completedOperationRetentionDays = positiveIntegerConfig(
      config,
      'BACKEND_GOOGLE_CALENDAR_COMPLETED_OPERATION_RETENTION_DAYS',
      30,
      3650,
    );
    this.tombstoneRetentionDays = positiveIntegerConfig(
      config,
      'BACKEND_GOOGLE_CALENDAR_TOMBSTONE_RETENTION_DAYS',
      90,
      3650,
    );
    this.retentionBatchSize = positiveIntegerConfig(
      config,
      'BACKEND_GOOGLE_CALENDAR_RETENTION_BATCH_SIZE',
      100,
      1000,
    );
    calendarSyncMetrics.registerOperationalSnapshotReader(() =>
      this.calendars.operationalMetricsSnapshot(),
    );
    const webhookUrl = config.get<string>('BACKEND_GOOGLE_WEBHOOK_URL')?.trim();

    if (webhookUrl) {
      const parsed = new URL(webhookUrl);
      if (
        parsed.protocol !== 'https:' ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
      )
        throw new Error(
          'BACKEND_GOOGLE_WEBHOOK_URL must be an HTTPS URL without credentials, query, or fragment.',
        );
      this.webhookUrl = parsed.toString();
    } else {
      this.webhookUrl = null;
    }
  }

  private readonly webhookUrl: string | null;

  async process(job: CalendarSyncJob): Promise<void> {
    if (!this.google.available()) return;

    switch (job.kind) {
      case 'operation':
        await this.processOperation(job.operationId);

        return;
      case 'recover':
        await this.recover();

        return;
      case 'pull':
        await this.processPull(job.bindingId, job.connectionGeneration);

        return;
      case 'renew-watch':
        await this.processRenewWatch(job.bindingId, job.connectionGeneration);

        return;
    }
  }

  async accessTokenForUser(userId: string): Promise<string | null> {
    if (!this.google.available()) return null;

    const [integration, credentials] = await Promise.all([
      this.calendars.status(userId),
      this.calendars.integrationCredentials(userId),
    ]);

    if (
      integration?.status !== 'connected' ||
      !integration.activeBindingId ||
      !credentials?.accessToken ||
      credentials.activeBindingId !== integration.activeBindingId
    )
      return null;

    return this.accessToken(integration.activeBindingId, {
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      accessTokenExpiresAt: credentials.expiresAt,
      credentialGeneration: credentials.credentialGeneration,
    });
  }

  async requestContextForUser(
    userId: string,
    lane: GoogleCalendarRequestLane,
  ): Promise<GoogleCalendarRequestContext | null> {
    const [integration, credentials] = await Promise.all([
      this.calendars.status(userId),
      this.calendars.integrationCredentials(userId),
    ]);

    const googleSubject = credentials?.googleSubject;

    if (
      integration?.status !== 'connected' ||
      !integration.activeBindingId ||
      credentials?.activeBindingId !== integration.activeBindingId ||
      !googleSubject?.trim()
    )
      return null;

    return {
      googleSubject,
      calendarId: null,
      lane,
    };
  }

  async resolveGoogleOccurrenceForMutation(
    userId: string,
    input: {
      seriesEventId: string;
      occurrenceKey: string;
      instanceEventId?: string;
    },
  ): Promise<
    | (CalendarEvent & {
        sourceEventId: string;
        seriesEventId: string;
        occurrenceKey: string;
        isOccurrence: true;
        instanceEventId: string | null;
      })
    | null
  > {
    const master = await this.calendars.findById(userId, input.seriesEventId);
    if (!master) return null;

    const keyKind = occurrenceKeyKind(input.occurrenceKey);
    if (
      master.provider !== 'google' ||
      !master.providerEventId ||
      master.recurringParentProviderEventId !== null ||
      master.recurrence.length === 0 ||
      !keyKind
    )
      throw new ApiException({
        code: ErrorCodes.CONFLICT,
        message: 'Rangkaian ini belum dapat diubah per kejadian.',
        status: HttpStatus.CONFLICT,
      });

    const [integration, credentials] = await Promise.all([
      this.calendars.status(userId),
      this.calendars.integrationCredentials(userId),
    ]);

    if (
      integration?.status !== 'connected' ||
      !integration.activeBindingId ||
      !credentials?.accessToken ||
      credentials.activeBindingId !== integration.activeBindingId ||
      !credentials.calendarId ||
      !credentials.googleSubject
    )
      throw new ApiException({
        code: ErrorCodes.CONFLICT,
        message: 'Hubungkan ulang Google Calendar untuk mengubah kejadian ini.',
        status: HttpStatus.CONFLICT,
      });

    const token = await this.accessToken(integration.activeBindingId, {
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      accessTokenExpiresAt: credentials.expiresAt,
      credentialGeneration: credentials.credentialGeneration,
    });

    const instances = await this.google.listEventInstances(
      token,
      credentials.calendarId,
      master.providerEventId,
      input.occurrenceKey,
      {
        googleSubject: credentials.googleSubject,
        calendarId: credentials.calendarId,
        lane: 'pull',
      },
    );

    const matches = instances.filter(
      (instance) =>
        instance.recurringEventId === master.providerEventId &&
        originalStartKey(instance) === input.occurrenceKey,
    );

    const resource = matches.length === 1 ? matches[0] : null;

    if (
      !resource ||
      (input.instanceEventId !== undefined &&
        resource.id !== input.instanceEventId)
    )
      throw new ApiException({
        code: ErrorCodes.CONFLICT,
        message: 'Kejadian ini berubah. Muat ulang kalender lalu coba lagi.',
        status: HttpStatus.CONFLICT,
      });

    if (resource.status === 'cancelled')
      throw new ApiException({
        code: ErrorCodes.CONFLICT,
        message: 'Kejadian ini sudah dibatalkan di Google Calendar.',
        status: HttpStatus.CONFLICT,
      });

    const inbound = parseInboundEvent(resource, master.timezone ?? 'UTC');
    const resolved = await this.calendars.materializeGoogleOccurrence({
      userId,
      seriesEventId: master.id,
      bindingId: integration.activeBindingId,
      calendarId: credentials.calendarId,
      connectionGeneration: integration.connectionGeneration,
      inbound,
    });

    if (!resolved)
      throw new ApiException({
        code: ErrorCodes.CONFLICT,
        message:
          'Kalender Google yang dipilih berubah. Muat ulang lalu coba lagi.',
        status: HttpStatus.CONFLICT,
      });

    return {
      ...resolved,
      sourceEventId: master.id,
      seriesEventId: master.id,
      occurrenceKey: input.occurrenceKey,
      isOccurrence: true,
      instanceEventId: resolved.providerEventId,
    };
  }

  async recoverOperations(): Promise<void> {
    const due = await this.calendars.dueOperationIds(RECOVERY_BATCH_SIZE);

    for (const operation of due) {
      await this.queues.calendarSync.add('calendar-operation-recovery', {
        kind: 'operation',
        operationId: operation.id,
      });
    }
  }

  async recover(): Promise<void> {
    if (!this.google.available()) return;

    await this.recoverOperations();
    const due = await this.calendars.dueBindingIds(RECOVERY_BATCH_SIZE);

    for (const binding of due) {
      await this.queues.calendarSync.add('calendar-pull-recovery', {
        kind: 'pull',
        bindingId: binding.id,
        connectionGeneration: binding.connectionGeneration,
      });
    }

    if (this.webhookUrl) {
      const watches =
        await this.calendars.dueWatchBindingIds(RECOVERY_BATCH_SIZE);

      for (const binding of watches) {
        await this.queues.calendarSync.add('calendar-watch-recovery', {
          kind: 'renew-watch',
          bindingId: binding.id,
          connectionGeneration: binding.connectionGeneration,
        });
      }
    }

    const retentionStartedAt = performance.now();

    try {
      const removed = await this.calendars.cleanupSyncRecords({
        completedOperationRetentionDays: this.completedOperationRetentionDays,
        tombstoneRetentionDays: this.tombstoneRetentionDays,
        batchSize: this.retentionBatchSize,
      });

      calendarSyncMetrics.recordRetention(removed);
      calendarSyncMetrics.recordSyncWork(
        'retention',
        'success',
        performance.now() - retentionStartedAt,
      );
    } catch (error) {
      calendarSyncMetrics.recordSyncWork(
        'retention',
        'failed',
        performance.now() - retentionStartedAt,
      );
      this.logger.error(
        'Calendar retention cleanup failed; expired records remain for the next recovery pass.',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async requestFullResync(
    userId: string,
  ): Promise<
    | { status: 'queued'; fullImportGeneration: number }
    | { status: 'missing' | 'not_ready' | 'busy' }
  > {
    if (!this.google.available())
      throw new ApiException({
        code: ErrorCodes.SERVICE_UNAVAILABLE,
        message: 'Google Calendar sync is unavailable on this server.',
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });

    const result = await this.calendars.requestFullResync(userId);
    if (result.status !== 'queued') return result;

    try {
      await this.queues.calendarSync.add('calendar-operator-full-resync', {
        kind: 'pull',
        bindingId: result.bindingId,
        connectionGeneration: result.connectionGeneration,
      });
    } catch (error) {
      this.logger.error(
        `Full calendar resync generation ${result.fullImportGeneration} for binding ${result.bindingId} is durable but queue dispatch failed; recovery will enqueue it.`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    return {
      status: 'queued',
      fullImportGeneration: result.fullImportGeneration,
    };
  }

  async webhook(input: {
    channelId: string | undefined;
    channelToken: string | undefined;
    resourceId: string | undefined;
    messageNumber: string | undefined;
  }): Promise<void> {
    if (!this.google.available()) return;

    if (
      !input.channelId ||
      !input.channelToken ||
      !input.resourceId ||
      !input.messageNumber
    )
      return;

    const marked = await this.calendars.markWatchDirtyNotification({
      channelId: input.channelId,
      tokenHash: createHash('sha256').update(input.channelToken).digest('hex'),
      resourceId: input.resourceId,
      messageNumber: input.messageNumber,
    });

    if (!marked.accepted) return;

    try {
      await this.queues.calendarSync.add('calendar-watch-notification', {
        kind: 'pull',
        bindingId: marked.bindingId,
        connectionGeneration: marked.connectionGeneration,
      });
    } catch (error) {
      this.logger.error(
        `Google Calendar notification for binding ${marked.bindingId} was persisted, but its queue dispatch failed; recovery will enqueue the pull.`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async processOperation(operationId: string): Promise<void> {
    const claimToken = randomUUID();
    const claim = await this.calendars.claimOperation(
      operationId,
      claimToken,
      OPERATION_LEASE_MS,
    );

    if (!claim) return;

    const operationStartedAt = performance.now();
    if (claim.operation.createdAt)
      calendarSyncMetrics.recordOperationAge(
        claim.operation.kind,
        claim.claimedAt.getTime() - claim.operation.createdAt.getTime(),
      );
    const firstAttemptAt =
      claim.operation.firstAttemptAt?.getTime() ?? claim.claimedAt.getTime();

    const attemptAgeMs = () =>
      Math.max(
        0,
        claim.claimedAt.getTime() +
          (performance.now() - operationStartedAt) -
          firstAttemptAt,
      );

    if (
      this.claimAttempts(claim) > this.operationRetryAttempts ||
      attemptAgeMs() >= this.operationRetryAgeMs
    ) {
      const exhaustedAgeMs = attemptAgeMs();
      const saved = await this.calendars.failOperation({
        operationId,
        claimToken: claim.operation.claimToken,
        claimEpoch: claim.operation.claimEpoch,
        errorCode: 'calendar_retry_budget_exhausted',
        outcome: 'failed',
      });

      if (!saved)
        this.logger.warn(
          `Calendar operation ${operationId} reached its retry budget after its database claim was fenced.`,
        );
      else {
        calendarSyncMetrics.recordExhaustedRetry();
        this.logger.error(
          `Calendar operation ${operationId} reached its automatic retry budget after ${this.claimAttempts(claim)} attempts or ${exhaustedAgeMs}ms; no additional provider request was sent.`,
        );
      }

      if (!saved) calendarSyncMetrics.recordLeaseLoss('operation');
      calendarSyncMetrics.recordSyncWork(
        'operation',
        saved ? 'failed' : 'lease_lost',
        performance.now() - operationStartedAt,
      );

      return;
    }

    let accessToken = claim.credentials.accessToken;
    let resource: GoogleEventResource | null;
    let reconciledEvent: CalendarInboundEventInput | undefined;

    try {
      accessToken = await this.accessToken(
        claim.binding.id,
        claim.credentials,
        this.requestGuard(this.operationFence(claim)),
      );
      resource = await this.perform(claim, accessToken);
      if (resource && claim.operation.kind === 'update')
        reconciledEvent = parseInboundEvent(resource, claim.binding.timezone);
    } catch (error) {
      let outcome = this.outcome(error);
      let persistedErrorCode = errorCode(error);
      let retryDelay: number | undefined;

      if (outcome === 'retry') {
        const delay = retryDelayMs(
          this.claimAttempts(claim),
          error,
          this.operationRetryDelayMs,
        );

        const ageMs = attemptAgeMs();
        const ageRemainingMs = this.operationRetryAgeMs - ageMs;

        if (
          this.claimAttempts(claim) >= this.operationRetryAttempts ||
          ageRemainingMs <= 0 ||
          delay >= ageRemainingMs
        ) {
          outcome = 'failed';
          persistedErrorCode = 'calendar_retry_budget_exhausted';
          this.logger.error(
            `Calendar operation ${operationId} exhausted its automatic retry budget after ${this.claimAttempts(claim)} provider attempts; last provider error was ${errorCode(error)}.`,
          );
        } else {
          retryDelay = delay;
        }
      } else if (outcome === 'deferred') {
        const delay =
          error instanceof GoogleCalendarRequestDeferredError
            ? error.retryAfterMs
            : BINDING_RETRY_MS;

        retryDelay = delay;
      }

      const input: FailCalendarSyncOperation = {
        operationId,
        claimToken: claim.operation.claimToken,
        claimEpoch: claim.operation.claimEpoch,
        errorCode: persistedErrorCode,
        outcome,
        ...(retryDelay !== undefined ? { retryDelayMs: retryDelay } : {}),
        ...(outcome === 'conflict'
          ? {
              conflict: {
                remoteSnapshot:
                  error instanceof CalendarUpdateConflictError
                    ? {
                        resource: error.inbound.rawSnapshot,
                        common: error.inbound.commonSnapshot,
                      }
                    : await this.remoteForConflict(claim, error, accessToken),
                conflictingFields:
                  error instanceof CalendarUpdateConflictError
                    ? error.fields
                    : ['event'],
              },
            }
          : {}),
      };

      const saved = await this.calendars.failOperation(input);

      if (!saved) calendarSyncMetrics.recordLeaseLoss('operation');
      else if (outcome === 'conflict') calendarSyncMetrics.recordConflict();
      if (persistedErrorCode === 'calendar_retry_budget_exhausted' && saved)
        calendarSyncMetrics.recordExhaustedRetry();

      if (!saved) {
        this.logger.warn(
          `Calendar operation ${operationId} failed after its database claim was fenced; no stale state was written.`,
        );
      } else if (outcome === 'retry' || outcome === 'deferred') {
        this.logger.warn(
          `Calendar operation ${operationId} ${outcome === 'deferred' ? 'was deferred before its next provider request' : 'will retry'}; the relative deadline was persisted using Postgres time.`,
        );
      } else {
        this.logger.error(
          `Calendar operation ${operationId} stopped with ${input.errorCode}.`,
        );
      }

      const metricOutcome = !saved
        ? 'lease_lost'
        : outcome === 'retry' ||
            outcome === 'deferred' ||
            outcome === 'conflict'
          ? outcome
          : 'failed';

      calendarSyncMetrics.recordSyncWork(
        'operation',
        metricOutcome,
        performance.now() - operationStartedAt,
      );

      return;
    }

    let complete: boolean;

    try {
      complete = await this.calendars.completeOperation({
        operationId,
        claimToken: claim.operation.claimToken,
        claimEpoch: claim.operation.claimEpoch,
        ...(reconciledEvent ? { reconciledEvent } : {}),
        ...(resource
          ? {
              remoteEventId: remoteId(resource),
              remoteEtag: remoteEtag(resource),
              remoteSnapshot: resource,
            }
          : {}),
      });
    } catch (error) {
      calendarSyncMetrics.recordSyncWork(
        'operation',
        'failed',
        performance.now() - operationStartedAt,
      );
      this.logger.error(
        `Calendar operation ${operationId} succeeded at Google but its completion could not be persisted; recovery will reconcile the same durable operation.`,
        { errorCode: errorCode(error) },
      );
      throw error;
    }

    if (!complete) {
      calendarSyncMetrics.recordLeaseLoss('operation');
      calendarSyncMetrics.recordSyncWork(
        'operation',
        'lease_lost',
        performance.now() - operationStartedAt,
      );
      this.logger.warn(
        `Calendar operation ${operationId} completed at Google but its database claim was fenced; recovery will reconcile it.`,
      );
    } else {
      calendarSyncMetrics.recordSyncWork(
        'operation',
        'success',
        performance.now() - operationStartedAt,
      );
    }
  }

  async processPull(
    bindingId: string,
    connectionGeneration: number,
  ): Promise<void> {
    const owner = randomUUID();
    const claim = await this.calendars.claimBindingSync(
      bindingId,
      connectionGeneration,
      owner,
      OPERATION_LEASE_MS,
    );

    if (!claim) return;

    const pullStartedAt = performance.now();
    const pullMode = claim.syncToken === null ? 'full_import' : 'incremental';
    if (claim.lastSyncedAt)
      calendarSyncMetrics.recordPullFreshness(
        pullMode,
        Date.now() - claim.lastSyncedAt.getTime(),
      );
    let accessToken = claim.credentials.accessToken;
    let page: Awaited<ReturnType<GoogleCalendarService['listEvents']>>;
    let events: CalendarInboundEventInput[];

    try {
      if (claim.pendingFullImportSyncToken) {
        page = {
          items: [],
          nextPageToken: null,
          nextSyncToken: claim.pendingFullImportSyncToken,
        };
      } else {
        accessToken = await this.accessToken(
          claim.id,
          claim.credentials,
          this.requestGuard(this.bindingFence(claim)),
        );
        page = await this.google.listEvents(
          accessToken,
          claim.calendarId,
          {
            pageToken: claim.nextPageToken,
            syncToken: claim.syncToken,
          },
          this.requestContext(
            claim,
            claim.syncToken === null ? 'import' : 'pull',
            this.bindingFence(claim),
          ),
        );
      }

      events = page.items.map((item) =>
        parseInboundEvent(item, claim.timezone),
      );
    } catch (error) {
      if (error instanceof GoogleCalendarApiError && error.httpStatus === 410) {
        const reset = await this.calendars.resetExpiredSyncToken({
          bindingId,
          connectionGeneration,
          owner,
          leaseEpoch: claim.leaseEpoch,
        });

        if (reset)
          await this.queues.calendarSync.add('calendar-full-resync', {
            kind: 'pull',
            bindingId,
            connectionGeneration,
          });
        else calendarSyncMetrics.recordLeaseLoss('binding');

        calendarSyncMetrics.recordSyncWork(
          'pull_page',
          reset ? 'deferred' : 'lease_lost',
          performance.now() - pullStartedAt,
        );

        return;
      }

      const outcome =
        error instanceof GoogleCalendarRequestDeferredError ||
        error instanceof GoogleCalendarRequestFencedError ||
        error instanceof GoogleCalendarAdmissionUnavailableError
          ? 'deferred'
          : isReconnectError(error)
            ? 'reconnect_required'
            : error instanceof GoogleCalendarApiError &&
                !isQuotaOrTransientGoogleError(error)
              ? 'failed'
              : (error instanceof GoogleCalendarApiError &&
                    isQuotaOrTransientGoogleError(error)) ||
                  isTransientTransportError(error)
                ? 'retry'
                : 'failed';

      const retryAfter =
        error instanceof GoogleCalendarApiError ? error.retryAfterMs : null;

      const delay =
        error instanceof GoogleCalendarRequestDeferredError
          ? error.retryAfterMs
          : outcome === 'reconnect_required'
            ? BINDING_RETRY_MS
            : retryAfter === null
              ? outcome === 'retry'
                ? BINDING_RETRY_MS
                : MAX_RETRY_MS
              : Math.max(1000, Math.min(retryAfter, MAX_RETRY_MS));

      const saved = await this.calendars.failBindingSync({
        bindingId,
        connectionGeneration,
        owner,
        leaseEpoch: claim.leaseEpoch,
        errorCode: errorCode(error),
        outcome,
        retryDelayMs: delay,
      });

      if (!saved) calendarSyncMetrics.recordLeaseLoss('binding');
      const metricOutcome = !saved
        ? 'lease_lost'
        : outcome === 'retry' || outcome === 'deferred'
          ? outcome
          : 'failed';

      calendarSyncMetrics.recordSyncWork(
        'pull_page',
        metricOutcome,
        performance.now() - pullStartedAt,
      );

      if (!saved)
        this.logger.warn(
          `Calendar pull for binding ${bindingId} failed after its lease was fenced; no stale state was written.`,
        );
      else if (outcome === 'deferred')
        this.logger.warn(
          `Calendar pull for binding ${bindingId} was deferred before its next provider request for ${delay}ms using a Postgres-based retry deadline.`,
        );
      else if (outcome === 'retry')
        this.logger.warn(
          `Calendar pull for binding ${bindingId} will retry after a transient provider or transport failure.`,
        );
      else
        this.logger.error(
          `Calendar pull for binding ${bindingId} stopped with ${errorCode(error)}.`,
        );

      return;
    }

    const saved = await this.calendars.saveCalendarSyncPage({
      bindingId,
      connectionGeneration,
      owner,
      leaseEpoch: claim.leaseEpoch,
      capturedDirtyRevision: claim.capturedDirtyRevision,
      fullImportGeneration: claim.fullImportGeneration,
      fullImport: claim.syncToken === null,
      nextPageToken: page.nextPageToken,
      nextSyncToken: page.nextSyncToken,
      events,
    });

    if (!saved) {
      calendarSyncMetrics.recordLeaseLoss('binding');
      calendarSyncMetrics.recordSyncWork(
        'pull_page',
        'lease_lost',
        performance.now() - pullStartedAt,
      );
      this.logger.warn(
        `Calendar pull page for binding ${bindingId} completed after its lease was fenced; recovery will resume from the persisted checkpoint.`,
      );

      return;
    }

    calendarSyncMetrics.recordPullPage(pullMode, events.length);
    calendarSyncMetrics.recordSyncWork(
      'pull_page',
      'success',
      performance.now() - pullStartedAt,
    );

    if (
      saved === 'continue' ||
      page.nextPageToken ||
      claim.dirtyRevision > claim.capturedDirtyRevision
    ) {
      await this.queues.calendarSync.add('calendar-pull-continuation', {
        kind: 'pull',
        bindingId,
        connectionGeneration,
      });
    }
  }

  async processRenewWatch(
    bindingId: string,
    connectionGeneration: number,
  ): Promise<void> {
    if (!this.webhookUrl) return;
    const owner = randomUUID();
    const now = new Date();
    const claim = await this.calendars.claimBindingSync(
      bindingId,
      connectionGeneration,
      owner,
      OPERATION_LEASE_MS,
    );

    if (!claim) return;

    const watchStartedAt = performance.now();
    let renewalOutcome: 'failed' | 'lease_lost' | 'success' = 'success';
    const channelId = randomUUID();
    const channelToken = randomBytes(32).toString('base64url');
    const requestedExpiration = new Date(
      now.getTime() + 7 * 24 * 60 * 60 * 1000 - 5 * 60 * 1000,
    );

    let released = false;

    try {
      let token: string;

      try {
        token = await this.accessToken(
          claim.id,
          claim.credentials,
          this.requestGuard(this.bindingFence(claim)),
        );
      } catch (error) {
        renewalOutcome = 'failed';
        released = await this.persistBindingFailure(claim, owner, error);

        return;
      }

      const stored = await this.calendars.createWatchChannel({
        bindingId,
        connectionGeneration,
        channelId,
        tokenHash: createHash('sha256').update(channelToken).digest('hex'),
        expiresAt: requestedExpiration,
      });

      if (!stored) {
        renewalOutcome = 'lease_lost';

        return;
      }

      let watch: Awaited<ReturnType<GoogleCalendarService['watchEvents']>>;

      try {
        watch = await this.google.watchEvents(
          token,
          claim.calendarId,
          {
            channelId,
            channelToken,
            address: this.webhookUrl,
            expiration: requestedExpiration.getTime(),
          },
          this.requestContext(claim, 'watch', this.bindingFence(claim)),
        );
      } catch (error) {
        renewalOutcome = 'failed';

        if (
          error instanceof GoogleCalendarRequestDeferredError ||
          error instanceof GoogleCalendarRequestFencedError ||
          error instanceof GoogleCalendarAdmissionUnavailableError ||
          (error instanceof GoogleCalendarApiError && error.httpStatus < 500)
        )
          await this.calendars.failWatchChannel(channelId, errorCode(error));
        else {
          await this.calendars.markWatchCleanupPending(channelId);
          this.logger.warn(
            `Google Calendar watch registration for channel ${channelId} had an uncertain provider result; local notifications are disabled while the remote channel expires.`,
            { errorCode: errorCode(error) },
          );
        }

        released = await this.persistBindingFailure(claim, owner, error);

        return;
      }

      const activated = await this.calendars.activateWatchChannel({
        bindingId,
        channelId,
        connectionGeneration,
        resourceId: watch.resourceId,
        resourceUri: watch.resourceUri,
        expiresAt: watch.expiration ?? requestedExpiration,
      });

      if (!activated) {
        renewalOutcome = 'lease_lost';

        try {
          await this.google.stopWatch(token, channelId, watch.resourceId, {
            googleSubject: claim.googleSubject,
            calendarId: claim.calendarId,
            lane: 'watch',
          });
          await this.calendars.markWatchChannelStopped(channelId);
        } catch (error) {
          calendarSyncMetrics.recordCleanupFailure();
          await this.calendars.markWatchCleanupPending(channelId);
          this.logger.warn(
            `Late Google Calendar watch channel ${channelId} could not be stopped after its activation was fenced; it will expire automatically.`,
            { errorCode: errorCode(error) },
          );
        }

        return;
      }

      const oldChannels = await this.calendars.activeWatchChannels(bindingId);

      for (const channel of oldChannels) {
        if (channel.channelId === channelId) continue;

        if (!channel.resourceId) {
          await this.calendars.markWatchCleanupPending(channel.channelId);
          this.logger.warn(
            `Previous Google Calendar watch ${channel.channelId} has no resource ID for remote stop and will expire automatically.`,
          );

          continue;
        }

        try {
          await this.google.stopWatch(
            token,
            channel.channelId,
            channel.resourceId,
            this.requestContext(claim, 'watch', this.bindingFence(claim)),
          );
          await this.calendars.markWatchChannelStopped(channel.channelId);
        } catch (error) {
          calendarSyncMetrics.recordCleanupFailure();
          await this.calendars.markWatchCleanupPending(channel.channelId);
          this.logger.warn(
            `Previous Google Calendar watch ${channel.channelId} for binding ${bindingId} could not be stopped; duplicate notifications remain safe.`,
            { errorCode: errorCode(error) },
          );
        }
      }
    } catch (error) {
      renewalOutcome = 'failed';
      throw error;
    } finally {
      if (!released) {
        const didRelease = await this.calendars.releaseBindingSyncLease(
          bindingId,
          owner,
          claim.leaseEpoch,
        );

        if (!didRelease) {
          calendarSyncMetrics.recordLeaseLoss('binding');
          renewalOutcome = 'lease_lost';
          this.logger.warn(
            `Watch renewal lease for binding ${bindingId} was already fenced before release.`,
          );
        }
      }

      calendarSyncMetrics.recordWatchRenewal(renewalOutcome);
      calendarSyncMetrics.recordSyncWork(
        'watch_renewal',
        renewalOutcome,
        performance.now() - watchStartedAt,
      );
    }
  }

  private claimAttempts(claim: CalendarSyncOperationClaim): number {
    return claim.operation.retryBudgetAttempts;
  }

  private async persistBindingFailure(
    claim: CalendarBindingSyncClaim,
    owner: string,
    error: unknown,
  ): Promise<boolean> {
    const outcome =
      error instanceof GoogleCalendarRequestDeferredError ||
      error instanceof GoogleCalendarRequestFencedError ||
      error instanceof GoogleCalendarAdmissionUnavailableError
        ? 'deferred'
        : isReconnectError(error)
          ? 'reconnect_required'
          : error instanceof GoogleCalendarApiError &&
              !isQuotaOrTransientGoogleError(error)
            ? 'failed'
            : (error instanceof GoogleCalendarApiError &&
                  isQuotaOrTransientGoogleError(error)) ||
                isTransientTransportError(error) ||
                (error instanceof Error &&
                  error.message.includes('already in progress'))
              ? 'retry'
              : 'failed';

    const retryAfter =
      error instanceof GoogleCalendarApiError ? error.retryAfterMs : null;

    const delay =
      error instanceof GoogleCalendarRequestDeferredError
        ? error.retryAfterMs
        : retryAfter !== null
          ? Math.max(1000, Math.min(retryAfter, MAX_RETRY_MS))
          : outcome === 'failed'
            ? MAX_RETRY_MS
            : BINDING_RETRY_MS;

    const saved = await this.calendars.failBindingSync({
      bindingId: claim.id,
      connectionGeneration: claim.connectionGeneration,
      owner,
      leaseEpoch: claim.leaseEpoch,
      errorCode: errorCode(error),
      outcome,
      retryDelayMs: delay,
    });

    if (!saved)
      this.logger.warn(
        `Calendar background work for binding ${claim.id} failed after its lease was fenced.`,
      );
    else if (outcome === 'deferred')
      this.logger.warn(
        `Calendar background work for binding ${claim.id} was deferred before its next provider request for ${delay}ms using a Postgres-based retry deadline.`,
      );
    else
      this.logger.error(
        `Calendar background work for binding ${claim.id} failed with ${errorCode(error)}.`,
      );

    return saved;
  }

  private async accessToken(
    bindingId: string,
    credentials: CalendarSyncOperationClaim['credentials'],
    beforeRequest?: () => Promise<void>,
  ): Promise<string> {
    const now = new Date();
    const expiresAt = credentials.accessTokenExpiresAt;
    if (
      expiresAt &&
      expiresAt.getTime() > now.getTime() + TOKEN_MIN_VALIDITY_MS
    )
      return credentials.accessToken;

    const owner = randomUUID();
    const refresh = await this.calendars.claimCredentialRefresh(
      bindingId,
      credentials.credentialGeneration,
      owner,
      CREDENTIAL_LEASE_MS,
      TOKEN_MIN_VALIDITY_MS,
    );

    if (refresh.status === 'fresh') return refresh.accessToken;
    if (refresh.status === 'busy')
      throw new Error('Google access token refresh is already in progress.');

    if (refresh.status === 'unavailable') {
      calendarSyncMetrics.recordRefreshFailure();
      throw new GoogleCalendarApiError(401, 'refresh_token_unavailable', null);
    }

    try {
      const updated = await this.google.refresh(
        refresh.refreshToken,
        async () => {
          await beforeRequest?.();
          await this.requestGuard({
            kind: 'credential',
            bindingId,
            owner,
            credentialGeneration: refresh.credentialGeneration,
          })();
        },
      );

      const saved = await this.calendars.completeCredentialRefresh({
        bindingId,
        expectedGeneration: refresh.credentialGeneration,
        owner,
        accessToken: updated.accessToken,
        expiresAt: updated.expiresAt,
      });

      if (!saved)
        throw new Error(
          'Google access token refresh lost its credential lease.',
        );

      return updated.accessToken;
    } catch (error) {
      calendarSyncMetrics.recordRefreshFailure();
      const released = await this.calendars.releaseCredentialRefresh(
        bindingId,
        refresh.credentialGeneration,
        owner,
      );

      if (!released)
        this.logger.warn(
          `Credential refresh lease for binding ${bindingId} was already replaced before release.`,
        );
      throw error;
    }
  }

  private async perform(
    claim: CalendarSyncOperationClaim,
    accessToken: string,
  ): Promise<GoogleEventResource | null> {
    const { operation, binding, eventLink } = claim;
    const payload = parseEventWrite(operation.payload);

    if (operation.kind === 'create') {
      const eventId = operation.stableGoogleEventId;
      if (!eventId)
        throw new Error('Calendar create operation has no stable event id.');

      try {
        return await this.google.createEvent(
          accessToken,
          binding.calendarId,
          eventId,
          operation.id,
          payload,
          this.requestContext(binding, 'outbound', this.operationFence(claim)),
        );
      } catch (error) {
        if (!isDuplicateCreate(error)) throw error;
        const existing = await this.google.getEvent(
          accessToken,
          binding.calendarId,
          eventId,
          this.requestContext(binding, 'outbound', this.operationFence(claim)),
        );

        if (this.operationMarker(existing) !== operation.id)
          throw new Error(
            'Google event id collision does not belong to this operation.',
          );

        return existing;
      }
    }

    const eventId =
      eventLink?.googleEventId ??
      (isRecord(operation.payload)
        ? optionalString(operation.payload.providerEventId)
        : null);

    if (!eventId) {
      if (operation.kind === 'delete') return null;
      throw new Error('Calendar update operation has no linked Google event.');
    }

    if (operation.kind === 'delete') {
      try {
        await this.google.deleteEvent(
          accessToken,
          binding.calendarId,
          eventId,
          eventLink?.etag ?? null,
          this.requestContext(binding, 'outbound', this.operationFence(claim)),
        );
      } catch (error) {
        if (!isMissingRemoteEvent(error)) throw error;
      }

      return null;
    }

    const base = parseEventWrite(operation.baseSnapshot);

    const reconcile = (resource: GoogleEventResource) => {
      if (remoteId(resource) !== eventId)
        throw new Error(
          'Google returned a different event identity during update reconciliation.',
        );
      const inbound = parseInboundEvent(resource, binding.timezone);
      if (!inbound.event || inbound.status === 'cancelled')
        throw new CalendarUpdateConflictError(inbound, ['status']);
      const result = reconcileCalendarUpdate(base, payload, inbound.event);
      if (result.status === 'conflict')
        throw new CalendarUpdateConflictError(inbound, result.fields);

      return result.patch;
    };

    const context = this.requestContext(
      binding,
      'outbound',
      this.operationFence(claim),
    );

    const current = await this.google.getEvent(
      accessToken,
      binding.calendarId,
      eventId,
      context,
    );

    const patch = reconcile(current);
    if (Object.keys(patch).length === 0) return current;
    const etag = remoteEtag(current);
    if (!etag)
      throw new Error('Google event has no ETag for a conditional update.');

    try {
      const updated = await this.google.updateEvent(
        accessToken,
        binding.calendarId,
        eventId,
        operation.id,
        patch,
        etag,
        context,
      );

      if (Object.keys(reconcile(updated)).length !== 0)
        throw new Error(
          'Google did not confirm the requested calendar fields after updating.',
        );

      return updated;
    } catch (error) {
      if (!isPreconditionFailure(error)) throw error;
      this.logger.warn(
        `Calendar operation ${operation.id} encountered a changed provider ETag; reconciling the latest version before retry.`,
      );
      const latest = await this.google.getEvent(
        accessToken,
        binding.calendarId,
        eventId,
        context,
      );

      if (Object.keys(reconcile(latest)).length === 0) return latest;
      throw new CalendarVersionChangedError();
    }
  }

  private operationMarker(resource: GoogleEventResource): string | null {
    if (!isRecord(resource.extendedProperties)) return null;
    const privateProperties = resource.extendedProperties.private;
    if (!isRecord(privateProperties)) return null;

    return optionalString(privateProperties.sydiaOperationId);
  }

  private outcome(error: unknown): FailCalendarSyncOperation['outcome'] {
    if (
      error instanceof GoogleCalendarRequestDeferredError ||
      error instanceof GoogleCalendarRequestFencedError ||
      error instanceof GoogleCalendarAdmissionUnavailableError
    )
      return 'deferred';
    if (isReconnectError(error)) return 'reconnect_required';
    if (error instanceof CalendarVersionChangedError) return 'retry';
    if (
      error instanceof CalendarUpdateConflictError ||
      isPreconditionFailure(error)
    )
      return 'conflict';
    if (
      error instanceof Error &&
      error.message.includes('id collision does not belong')
    )
      return 'conflict';

    if (error instanceof GoogleCalendarApiError) {
      if (isQuotaOrTransientGoogleError(error)) return 'retry';

      return 'failed';
    }

    if (isTransientTransportError(error)) return 'retry';
    if (error instanceof Error && error.message.includes('already in progress'))
      return 'retry';
    if (
      error instanceof Error &&
      error.message.includes('lost its credential lease')
    )
      return 'retry';

    return 'failed';
  }

  private async remoteForConflict(
    claim: CalendarSyncOperationClaim,
    error: unknown,
    accessToken: string,
  ): Promise<unknown> {
    const eventId = claim.eventLink?.googleEventId;
    if (!eventId) return { error: errorCode(error) };

    try {
      const resource = await this.google.getEvent(
        accessToken,
        claim.binding.calendarId,
        eventId,
        this.requestContext(
          claim.binding,
          'outbound',
          this.operationFence(claim),
        ),
      );

      const inbound = parseInboundEvent(resource, 'UTC');

      return { resource, common: inbound.commonSnapshot };
    } catch (fetchError) {
      if (fetchError instanceof Error) throw fetchError;

      throw new Error(
        'Failed to capture the remote event for conflict resolution.',
      );
    }
  }

  private operationFence(
    claim: CalendarSyncOperationClaim,
  ): CalendarRequestFence {
    return {
      kind: 'operation',
      bindingId: claim.binding.id,
      connectionGeneration: claim.operation.connectionGeneration,
      operationId: claim.operation.id,
      claimToken: claim.operation.claimToken,
      claimEpoch: claim.operation.claimEpoch,
    };
  }

  private bindingFence(claim: CalendarBindingSyncClaim): CalendarRequestFence {
    return {
      kind: 'binding',
      bindingId: claim.id,
      connectionGeneration: claim.connectionGeneration,
      owner: claim.leaseOwner,
      leaseEpoch: claim.leaseEpoch,
    };
  }

  private requestGuard(fence: CalendarRequestFence): () => Promise<void> {
    return async () => {
      let allowed: boolean;

      try {
        allowed = await this.calendars.canSendCalendarRequest(
          fence,
          REQUEST_MIN_LEASE_MS,
        );
      } catch (error) {
        this.logger.error(
          `Calendar request for binding ${fence.bindingId} could not verify its database claim; no provider request was sent.`,
          { errorCode: errorCode(error) },
        );
        throw error;
      }

      if (allowed) return;
      this.logger.warn(
        `Calendar request for binding ${fence.bindingId} was fenced before provider access because its claim changed or has less than 20 seconds remaining.`,
      );
      throw new GoogleCalendarRequestFencedError();
    };
  }

  private requestContext(
    binding: { googleSubject: string; calendarId: string },
    lane: GoogleCalendarRequestLane,
    fence?: CalendarRequestFence,
  ): GoogleCalendarRequestContext {
    return {
      googleSubject: binding.googleSubject,
      calendarId: binding.calendarId,
      lane,
      ...(fence ? { beforeRequest: this.requestGuard(fence) } : {}),
    };
  }
}
