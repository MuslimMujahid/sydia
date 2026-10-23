import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type {
  CalendarEvent,
  CalendarEventWrite,
} from '../../database/entities';
import {
  CALENDAR_REPOSITORY,
  type CalendarConflictResolution,
  type CalendarMutationRequest,
  type CalendarMutationResult,
  type ICalendarRepository,
} from '../../database/interfaces';
import { QueueService } from '../../infra/queue';
import { ApiException, ErrorCodes } from '../../shared/errors';

const RECEIPT_RETENTION_MS = 48 * 60 * 60 * 1000;

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonical(record[key])]),
    );
  }

  return value;
}

function mutationRequest(
  userId: string,
  action: string,
  value: unknown,
  key?: string,
): CalendarMutationRequest {
  const requestKey = key?.trim() || randomUUID();
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(canonical({ userId, action, value })))
    .digest('hex');

  return {
    key: requestKey,
    fingerprint,
    expiresAt: new Date(Date.now() + RECEIPT_RETENTION_MS),
  };
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    @Inject(CALENDAR_REPOSITORY)
    private readonly calendars: ICalendarRepository,
    @Optional() private readonly queues?: QueueService,
  ) {}

  async create(
    userId: string,
    input: CalendarEventWrite,
    destination: 'auto' | 'local' | 'google' = 'auto',
    idempotencyKey?: string,
  ): Promise<CalendarEvent> {
    const result = await this.calendars.createMutation(
      userId,
      input,
      destination,
      mutationRequest(userId, 'create', { input, destination }, idempotencyKey),
    );

    return this.saved(result);
  }

  async copyToLocal(
    userId: string,
    id: string,
    idempotencyKey: string,
  ): Promise<CalendarEvent | null> {
    const source = await this.calendars.findById(userId, id);
    if (!source) return null;
    if (source.provider !== 'google' || source.status === 'cancelled')
      throw new ApiException({
        code: ErrorCodes.CONFLICT,
        message: 'Only active Google Calendar events can be copied to Sydia.',
        status: HttpStatus.CONFLICT,
      });

    let input: CalendarEventWrite;

    if (source.allDayStartDate && source.allDayEndDate) {
      input = {
        title: source.title,
        description: source.description,
        location: source.location,
        attendees: source.attendees,
        recurrence: source.recurrence,
        status: source.status,
        allDayStartDate: source.allDayStartDate,
        allDayEndDate: source.allDayEndDate,
      };
    } else if (source.startAt && source.endAt) {
      if (source.recurrence.length > 0 && !source.timezone)
        throw new ApiException({
          code: ErrorCodes.CONFLICT,
          message:
            'Reconnect Google Calendar before copying this recurring event; its time zone is unavailable.',
          status: HttpStatus.CONFLICT,
        });
      input = {
        title: source.title,
        description: source.description,
        location: source.location,
        attendees: source.attendees,
        recurrence: source.recurrence,
        status: source.status,
        startAt: source.startAt,
        endAt: source.endAt,
        timezone: source.timezone ?? 'UTC',
      };
    } else {
      throw new ApiException({
        code: ErrorCodes.CONFLICT,
        message:
          'This Google Calendar event has no supported time range to copy.',
        status: HttpStatus.CONFLICT,
      });
    }

    const result = await this.calendars.createMutation(
      userId,
      input,
      'local',
      mutationRequest(
        userId,
        'copy',
        { sourceEventId: id, input },
        idempotencyKey,
      ),
    );

    return result.status === 'missing' ? null : this.saved(result);
  }

  async exportToGoogle(
    userId: string,
    id: string,
    idempotencyKey: string,
  ): Promise<CalendarEvent | null> {
    const result = await this.calendars.exportMutation(
      userId,
      id,
      mutationRequest(userId, 'export', { eventId: id }, idempotencyKey),
    );

    if (result.status === 'missing') return null;
    if (result.status === 'read_only')
      throw new ApiException({
        code: ErrorCodes.CONFLICT,
        message: 'Only a Sydia-only event can be exported to Google Calendar.',
        status: HttpStatus.CONFLICT,
      });

    return this.saved(result);
  }

  listOpenConflicts(userId: string) {
    return this.calendars.listOpenConflicts(userId);
  }

  listRecovery(userId: string, beforeId?: string) {
    return this.calendars.listRecovery(userId, beforeId);
  }

  async restoreRecovery(
    userId: string,
    id: string,
    version: 'local' | 'remote',
    idempotencyKey?: string,
  ): Promise<CalendarEvent> {
    const recovery = await this.calendars.findRecovery(userId, id);
    if (!recovery)
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Riwayat acara tidak ditemukan.',
        status: HttpStatus.NOT_FOUND,
      });
    const snapshot = recovery[version];
    if (!snapshot || !snapshot.title)
      throw new ApiException({
        code: ErrorCodes.CONFLICT,
        message: 'Versi ini tidak berisi acara yang dapat dipulihkan.',
        status: HttpStatus.CONFLICT,
      });
    const common = {
      title: snapshot.title,
      description: snapshot.description,
      location: snapshot.location,
      attendees: snapshot.attendees,
      recurrence: snapshot.recurrence,
      status:
        snapshot.status === 'tentative'
          ? ('tentative' as const)
          : ('confirmed' as const),
    };

    let input: CalendarEventWrite;
    if (snapshot.allDayStartDate && snapshot.allDayEndDate) {
      input = {
        ...common,
        allDayStartDate: new Date(snapshot.allDayStartDate),
        allDayEndDate: new Date(snapshot.allDayEndDate),
        timezone: snapshot.timezone,
      };
    } else if (snapshot.startAt && snapshot.endAt && snapshot.timezone) {
      input = {
        ...common,
        startAt: new Date(snapshot.startAt),
        endAt: new Date(snapshot.endAt),
        timezone: snapshot.timezone,
      };
    } else
      throw new ApiException({
        code: ErrorCodes.CONFLICT,
        message: 'Versi ini tidak memiliki waktu acara yang lengkap.',
        status: HttpStatus.CONFLICT,
      });
    // Restoration is a deliberate local copy. It never revives the provider
    // event, changes a tombstone, or sends old account data to a new source.
    const result = await this.calendars.createMutation(
      userId,
      input,
      'local',
      mutationRequest(
        userId,
        'restore_recovery',
        { id, version },
        idempotencyKey,
      ),
    );

    return this.saved(result);
  }

  async resolveConflict(
    userId: string,
    conflictId: string,
    resolution: CalendarConflictResolution,
    expectedLocalRevision: number,
    expectedRemoteEtag: string | null,
    idempotencyKey?: string,
  ): Promise<CalendarEvent> {
    const result = await this.calendars.resolveConflict(
      userId,
      conflictId,
      resolution,
      expectedLocalRevision,
      expectedRemoteEtag,
      mutationRequest(
        userId,
        'resolve_conflict',
        { conflictId, resolution, expectedLocalRevision, expectedRemoteEtag },
        idempotencyKey,
      ),
    );

    if (result.status === 'saved') {
      if (result.operationId) this.dispatch(result.operationId);

      return result.event;
    }

    switch (result.status) {
      case 'missing':
        throw new ApiException({
          code: ErrorCodes.NOT_FOUND,
          message: 'Kalender atau konflik tidak ditemukan.',
          status: HttpStatus.NOT_FOUND,
        });
      case 'stale':
        throw new ApiException({
          code: ErrorCodes.CONFLICT,
          message: 'Konflik berubah. Muat ulang sebelum memilih versi.',
          status: HttpStatus.CONFLICT,
        });
      case 'busy':
        throw new ApiException({
          code: ErrorCodes.CONFLICT,
          message:
            'Sinkronisasi acara ini sedang berjalan. Coba lagi sebentar.',
          status: HttpStatus.CONFLICT,
        });
      case 'reconnect_required':
        throw new ApiException({
          code: ErrorCodes.CONFLICT,
          message:
            'Hubungkan ulang Google Calendar untuk menyelesaikan konflik.',
          status: HttpStatus.CONFLICT,
        });
      case 'read_only':
        throw new ApiException({
          code: ErrorCodes.CONFLICT,
          message: 'Kalender Google sedang tidak dapat ditulis.',
          status: HttpStatus.CONFLICT,
        });
    }
  }

  async selectGoogleCalendar(
    userId: string,
    calendar: { id: string; name: string; timezone: string },
  ): Promise<{ calendarId: string; calendarName: string; changed: boolean }> {
    const result = await this.calendars.selectGoogleCalendar(userId, calendar);
    if (result.status === 'missing')
      throw new ApiException({
        code: ErrorCodes.CONFLICT,
        message: 'Hubungkan Google Calendar sebelum memilih kalender.',
        status: HttpStatus.CONFLICT,
      });

    if (result.status === 'selected')
      this.dispatchInitialSync(result.bindingId, result.connectionGeneration);

    return {
      calendarId: calendar.id,
      calendarName: calendar.name,
      changed: result.status === 'selected',
    };
  }

  async update(
    userId: string,
    id: string,
    input: Partial<CalendarEventWrite>,
    idempotencyKey?: string,
  ): Promise<CalendarEvent | null> {
    const result = await this.calendars.updateMutation(
      userId,
      id,
      input,
      mutationRequest(userId, 'update', { id, input }, idempotencyKey),
    );

    if (result.status === 'missing') return null;

    return this.saved(result);
  }

  async findById(userId: string, id: string): Promise<CalendarEvent | null> {
    return this.calendars.findById(userId, id);
  }

  async retrySync(userId: string, id: string): Promise<CalendarEvent> {
    const result = await this.calendars.retryFailedOperation(userId, id);

    switch (result.status) {
      case 'queued':
        this.dispatch(result.operationId);

        return result.event;
      case 'missing':
        throw new ApiException({
          code: ErrorCodes.NOT_FOUND,
          message: 'Calendar event or user was not found.',
          status: HttpStatus.NOT_FOUND,
        });
      case 'reconnect_required':
        throw new ApiException({
          code: ErrorCodes.CONFLICT,
          message: 'Reconnect Google Calendar before retrying this event.',
          status: HttpStatus.CONFLICT,
        });
      case 'not_retryable':
        throw new ApiException({
          code: ErrorCodes.CONFLICT,
          message:
            'This event no longer has a retryable Google Calendar operation.',
          status: HttpStatus.CONFLICT,
        });
    }
  }

  async cancel(
    userId: string,
    id: string,
    idempotencyKey?: string,
  ): Promise<CalendarEvent | null> {
    const result = await this.calendars.cancelMutation(
      userId,
      id,
      mutationRequest(userId, 'cancel', { id }, idempotencyKey),
    );

    if (result.status === 'missing') return null;

    return this.saved(result);
  }

  private saved(result: CalendarMutationResult): CalendarEvent {
    if (result.status === 'saved') {
      if (result.operationId) this.dispatch(result.operationId);

      return result.event;
    }

    switch (result.status) {
      case 'reconnect_required':
        throw new ApiException({
          code: ErrorCodes.CONFLICT,
          message:
            'Google Calendar must be reconnected before this event can be saved there.',
          status: HttpStatus.CONFLICT,
        });
      case 'read_only':
        throw new ApiException({
          code: ErrorCodes.CONFLICT,
          message:
            'This Google feature requires an event linked to Google Calendar.',
          status: HttpStatus.CONFLICT,
        });
      case 'idempotency_conflict':
        throw new ApiException({
          code: ErrorCodes.CONFLICT,
          message:
            'This idempotency key was already used for a different calendar change.',
          status: HttpStatus.CONFLICT,
        });
      case 'missing':
        throw new ApiException({
          code: ErrorCodes.NOT_FOUND,
          message: 'Calendar event or user was not found.',
          status: HttpStatus.NOT_FOUND,
        });
    }
  }

  private dispatch(operationId: string): void {
    if (!this.queues) {
      this.logger.error(
        `Calendar operation ${operationId} is durable but queue dispatch is unavailable; recovery will enqueue it.`,
      );

      return;
    }

    void this.queues.calendarSync
      .add('calendar-operation', { kind: 'operation', operationId })
      .catch((error: unknown) => {
        this.logger.error(
          `Calendar operation ${operationId} is durable but queue dispatch failed; recovery will enqueue it.`,
          error instanceof Error ? error.stack : undefined,
        );
      });
  }

  private dispatchInitialSync(
    bindingId: string,
    connectionGeneration: number,
  ): void {
    if (!this.queues) {
      this.logger.error(
        `Calendar binding ${bindingId} is ready for initial sync, but the queue is unavailable; recovery will enqueue it.`,
      );

      return;
    }

    void this.queues.calendarSync
      .add('calendar-initial-sync', {
        kind: 'pull',
        bindingId,
        connectionGeneration,
      })
      .catch((error: unknown) => {
        this.logger.error(
          `Calendar binding ${bindingId} is ready for initial sync, but queue dispatch failed; recovery will enqueue it.`,
          error instanceof Error ? error.stack : undefined,
        );
      });
  }
}
