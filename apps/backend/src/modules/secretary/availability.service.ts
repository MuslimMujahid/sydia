import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  TASK_REPOSITORY,
  USER_REPOSITORY,
  type ITaskRepository,
  type IUserRepository,
} from '../../database/interfaces';
import { CalendarReadService } from '../calendar/calendar-read.service';
import type { CalendarEventOccurrence } from '../calendar/calendar-read.service';
import {
  findSchedule,
  schedulingInstant,
  SchedulingInputError,
  type BusyInterval,
} from './scheduling';
import {
  addLocalDays,
  localDate,
  localDateTime,
  localDayStart,
} from './local-time';
import { SECRETARY_CLOCK, type SecretaryClock } from './secretary-clock';

export type AvailabilityRequest = {
  date: string;
  durationMinutes: number;
  windowStart: string;
  windowEnd: string;
  bufferMinutes: number;
  requestedStart?: string;
  preferredBefore?: string;
  taskId?: string;
  deadline?: { date: string; time: string };
};

export type AvailabilityResult = {
  status:
    'requested_available' | 'requested_unavailable' | 'slots_found' | 'no_slot';
  timezone: string;
  date: string;
  constraints: {
    durationMinutes: number;
    window: string;
    bufferMinutes: number;
    deadline: string | null;
    preferredBefore: string | null;
  };
  requested: {
    interval: string;
    available: boolean;
    conflicts: Array<{
      title: string;
      interval: string;
      reason: 'overlap' | 'buffer';
    }>;
  } | null;
  slots: Array<{ start: string; end: string; matchesPreference: boolean }>;
  task: {
    id: string;
    title: string;
    status: string;
    dueAt: string | null;
  } | null;
  busyConsidered: Array<{ title: string; interval: string; status: string }>;
  coverage: 'sydia_calendar';
  nextStep: string;
};

export class AvailabilityUnavailableError extends Error {
  constructor(readonly code: 'calendar_read_failed' | 'task_not_found') {
    super(
      code === 'calendar_read_failed'
        ? 'Sydia calendar could not be read; availability is unverified. Do not claim the time is free.'
        : 'The referenced task was not found for this account.',
    );
    this.name = 'AvailabilityUnavailableError';
  }
}

/** Busy intervals blocked by an occurrence, or none for cancelled ones. */
export function busyIntervalOf(
  event: CalendarEventOccurrence,
  timezone: string,
): BusyInterval | null {
  if (event.status === 'cancelled') return null;

  if (event.startAt && event.endAt)
    return {
      id: event.id,
      title: event.title,
      start: event.startAt,
      end: event.endAt,
    };

  if (event.allDayStartDate && event.allDayEndDate) {
    // All-day dates are stored as UTC-midnight date values; the end is exclusive.
    return {
      id: event.id,
      title: event.title,
      start: localDayStart(
        event.allDayStartDate.toISOString().slice(0, 10),
        timezone,
      ),
      end: localDayStart(
        event.allDayEndDate.toISOString().slice(0, 10),
        timezone,
      ),
    };
  }

  return null;
}

/**
 * Read-only availability calculation over current Sydia calendar occurrences.
 * It never persists an offer or event.
 */
@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(
    private readonly calendar: CalendarReadService,
    @Inject(TASK_REPOSITORY) private readonly tasks: ITaskRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(SECRETARY_CLOCK) private readonly clock: SecretaryClock,
  ) {}

  async check(
    userId: string,
    request: AvailabilityRequest,
    at?: Date,
  ): Promise<AvailabilityResult> {
    const user = await this.users.findById(userId);
    if (!user) throw new Error('Availability requires an existing owner.');
    const timezone = user.timezone;
    const now = at ?? this.clock.now();

    let task: AvailabilityResult['task'] = null;
    let deadline: Date | undefined;

    if (request.taskId) {
      const found = await this.tasks.findById(userId, request.taskId);
      if (!found) throw new AvailabilityUnavailableError('task_not_found');
      task = {
        id: found.id,
        title: found.title,
        status: found.status,
        dueAt: found.dueAt ? localDateTime(found.dueAt, timezone) : null,
      };
      if (found.status === 'inbox' && found.dueAt) deadline = found.dueAt;
    }

    if (request.deadline) {
      const explicit = schedulingInstant(
        request.deadline.date,
        request.deadline.time,
        timezone,
      );

      deadline = deadline && deadline < explicit ? deadline : explicit;
    }

    // Validates date/time/DST before reading anything.
    schedulingInstant(request.date, request.windowStart, timezone);

    let occurrences: CalendarEventOccurrence[];

    try {
      occurrences = await this.calendar.list(
        userId,
        localDayStart(addLocalDays(request.date, -1), timezone),
        localDayStart(addLocalDays(request.date, 2), timezone),
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'availability_calendar_read_failed',
          code: 'calendar_read_failed',
          errorName: error instanceof Error ? error.name : 'UnknownError',
          remediation:
            'Check database connectivity and calendar read limits; no availability claim was made.',
        }),
      );
      throw new AvailabilityUnavailableError('calendar_read_failed');
    }

    const busy = occurrences
      .map((event) => busyIntervalOf(event, timezone))
      .filter((value): value is BusyInterval => value !== null);

    const result = findSchedule(
      {
        date: request.date,
        timezone,
        durationMinutes: request.durationMinutes,
        windowStart: request.windowStart,
        windowEnd: request.windowEnd,
        bufferMinutes: request.bufferMinutes,
        preferredBefore: request.preferredBefore,
        requestedStart: request.requestedStart,
        deadline,
      },
      busy,
      now,
    );

    const interval = (start: Date, end: Date): string =>
      `${localDateTime(start, timezone)}–${localDateTime(end, timezone).slice(11)}`;

    let requested: AvailabilityResult['requested'] = null;

    if (request.requestedStart) {
      const start = schedulingInstant(
        request.date,
        request.requestedStart,
        timezone,
      );

      const end = new Date(start.getTime() + request.durationMinutes * 60_000);
      const windowStart = schedulingInstant(
        request.date,
        request.windowStart,
        timezone,
      );

      const windowEnd = schedulingInstant(
        request.date,
        request.windowEnd,
        timezone,
      );

      const outside =
        start < windowStart ||
        end > windowEnd ||
        (deadline !== undefined && end > deadline) ||
        start < now;

      requested = {
        interval: interval(start, end),
        available: result.requestedAvailable === true && !outside,
        conflicts: result.conflicts.map((conflict) => {
          const conflictStart = new Date(conflict.start);
          const conflictEnd = new Date(conflict.end);
          const overlaps = start < conflictEnd && end > conflictStart;

          return {
            title: conflict.title,
            interval: interval(conflictStart, conflictEnd),
            reason: overlaps ? 'overlap' : 'buffer',
          };
        }),
      };
    }

    const slots = result.slots.map((slot) => ({
      start: localDateTime(new Date(slot.start), timezone),
      end: localDateTime(new Date(slot.end), timezone),
      matchesPreference: slot.preferred,
    }));

    const dayStart = localDayStart(request.date, timezone);
    const dayEnd = localDayStart(addLocalDays(request.date, 1), timezone);

    return {
      status: requested
        ? requested.available
          ? 'requested_available'
          : 'requested_unavailable'
        : slots.length
          ? 'slots_found'
          : 'no_slot',
      timezone,
      date: request.date,
      constraints: {
        durationMinutes: request.durationMinutes,
        window: `${request.windowStart}–${request.windowEnd}`,
        bufferMinutes: request.bufferMinutes,
        deadline: deadline ? localDateTime(deadline, timezone) : null,
        preferredBefore: request.preferredBefore ?? null,
      },
      requested,
      slots,
      task,
      busyConsidered: occurrences
        .filter((event) => {
          const value = busyIntervalOf(
            { ...event, status: 'confirmed' },
            timezone,
          );

          return value !== null && value.start < dayEnd && value.end > dayStart;
        })
        .map((event) => {
          const value = busyIntervalOf(
            { ...event, status: 'confirmed' },
            timezone,
          )!;

          return {
            title: event.title,
            interval:
              event.allDayStartDate !== null && event.startAt === null
                ? `all day ${localDate(value.start, timezone)}`
                : interval(value.start, value.end),
            status: event.status,
          };
        }),
      coverage: 'sydia_calendar',
      nextStep:
        'Report these calculated results only. Nothing is saved to the calendar. Before asking whether to schedule a slot as a calendar event, prefer calling prepare_action (create_calendar_event) so acceptance saves exactly this interval once; if the user only asked to check or said not to offer, do not ask.',
    };
  }
}

export { SchedulingInputError };
