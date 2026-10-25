import { zonedInstant, zonedParts } from '../../shared/date-time/timezone-day';

export type BusyInterval = {
  id: string;
  title: string;
  start: Date;
  end: Date;
};

export type ScheduleConstraints = {
  date: string;
  timezone: string;
  durationMinutes: number;
  windowStart: string;
  windowEnd: string;
  bufferMinutes: number;
  preferredBefore?: string;
  deadline?: Date;
  requestedStart?: string;
};

export type ScheduleSlot = { start: string; end: string; preferred: boolean };
export type ScheduleResult = {
  status: 'available' | 'conflict' | 'no_slot';
  slots: ScheduleSlot[];
  conflicts: Array<{ id: string; title: string; start: string; end: string }>;
  requestedAvailable: boolean | null;
};

export class SchedulingInputError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SchedulingInputError';
  }
}

function clockMinutes(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new SchedulingInputError(
      'invalid_time',
      'Use a local time in HH:mm format.',
    );
  const [hour, minute] = value.split(':').map(Number);

  return hour! * 60 + minute!;
}

/** Reject DST gaps and overlaps rather than silently choosing another instant. */
export function schedulingInstant(
  date: string,
  time: string,
  timezone: string,
): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new SchedulingInputError(
      'invalid_date',
      'Use a calendar date in YYYY-MM-DD format.',
    );
  const [year, month, day] = date.split('-').map(Number);
  const minutes = clockMinutes(time);
  const fields = {
    year: year!,
    month: month!,
    day: day!,
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
    second: 0,
  };

  const wall = Date.UTC(
    fields.year,
    fields.month - 1,
    fields.day,
    fields.hour,
    fields.minute,
  );

  const dateCheck = new Date(
    Date.UTC(fields.year, fields.month - 1, fields.day),
  );

  if (dateCheck.toISOString().slice(0, 10) !== date)
    throw new SchedulingInputError(
      'invalid_date',
      'That calendar date does not exist.',
    );
  // Force IANA-zone validation even for zones without nearby transitions.
  const first = zonedInstant(fields, timezone);
  const offsets = new Set<number>();

  for (const hours of [-36, -18, 0, 18, 36]) {
    const sample = new Date(first.getTime() + hours * 3_600_000);
    const part = zonedParts(sample, timezone);
    offsets.add(
      Date.UTC(
        part.year,
        part.month - 1,
        part.day,
        part.hour,
        part.minute,
        part.second,
      ) - sample.getTime(),
    );
  }

  const candidates = [...offsets]
    .map((offset) => new Date(wall - offset))
    .filter((instant) => {
      const part = zonedParts(instant, timezone);

      return (
        part.year === fields.year &&
        part.month === fields.month &&
        part.day === fields.day &&
        part.hour === fields.hour &&
        part.minute === fields.minute
      );
    });

  if (candidates.length === 0)
    throw new SchedulingInputError(
      'nonexistent_local_time',
      'That local time is skipped by a timezone transition. Choose another time.',
    );
  if (candidates.length !== 1)
    throw new SchedulingInputError(
      'ambiguous_local_time',
      'That local time occurs twice. Clarify the UTC offset before scheduling.',
    );

  return candidates[0]!;
}

export function findSchedule(
  constraints: ScheduleConstraints,
  busy: readonly BusyInterval[],
  now: Date,
): ScheduleResult {
  const { date, timezone, durationMinutes, bufferMinutes } = constraints;
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1 ||
    durationMinutes > 720
  )
    throw new SchedulingInputError(
      'duration_required',
      'Specify a duration between 1 and 720 minutes.',
    );
  if (
    !Number.isInteger(bufferMinutes) ||
    bufferMinutes < 0 ||
    bufferMinutes > 240
  )
    throw new SchedulingInputError(
      'invalid_buffer',
      'Specify a buffer between 0 and 240 minutes.',
    );
  const start = schedulingInstant(
    date,
    constraints.windowStart,
    timezone,
  ).getTime();

  const windowEnd = schedulingInstant(
    date,
    constraints.windowEnd,
    timezone,
  ).getTime();

  if (windowEnd <= start)
    throw new SchedulingInputError(
      'invalid_window',
      'The scheduling window must end after it starts on the requested date.',
    );
  const end = Math.min(windowEnd, constraints.deadline?.getTime() ?? windowEnd);
  const earliest = Math.max(start, now.getTime());
  const duration = durationMinutes * 60_000;
  const buffer = bufferMinutes * 60_000;
  const preferredEnd = constraints.preferredBefore
    ? schedulingInstant(date, constraints.preferredBefore, timezone).getTime()
    : null;

  const intervals = busy
    .map((item) => {
      if (
        !Number.isFinite(item.start.getTime()) ||
        !Number.isFinite(item.end.getTime()) ||
        item.end <= item.start
      )
        throw new SchedulingInputError(
          'invalid_busy_interval',
          'Calendar availability contains an invalid interval; refresh the source before scheduling.',
        );

      return {
        ...item,
        from: item.start.getTime() - buffer,
        to: item.end.getTime() + buffer,
      };
    })
    .filter((item) => item.to > earliest && item.from < end)
    .sort((a, b) => a.from - b.from || a.to - b.to || a.id.localeCompare(b.id));

  const fits = (at: number): boolean =>
    at >= earliest &&
    at + duration <= end &&
    !intervals.some((item) => at < item.to && at + duration > item.from);

  const conflicts = constraints.requestedStart
    ? (() => {
        const at = schedulingInstant(
          date,
          constraints.requestedStart,
          timezone,
        ).getTime();

        return intervals
          .filter((item) => at < item.to && at + duration > item.from)
          .map(({ id, title, start, end }) => ({
            id,
            title,
            start: start.toISOString(),
            end: end.toISOString(),
          }));
      })()
    : [];

  const candidates: number[] = [];
  let cursor = earliest;

  for (const item of intervals) {
    if (cursor + duration <= Math.min(end, item.from)) candidates.push(cursor);
    cursor = Math.max(cursor, item.to);
  }

  if (cursor + duration <= end) candidates.push(cursor);
  const requested = constraints.requestedStart
    ? schedulingInstant(date, constraints.requestedStart, timezone).getTime()
    : null;

  const requestedAvailable = requested === null ? null : fits(requested);
  const times =
    requestedAvailable && requested !== null
      ? [requested, ...candidates.filter((time) => time !== requested)]
      : candidates;

  const slots = times
    .map((time) => ({
      start: new Date(time).toISOString(),
      end: new Date(time + duration).toISOString(),
      preferred: preferredEnd === null || time + duration <= preferredEnd,
    }))
    .sort((a, b) => {
      // A valid explicitly requested interval takes precedence over a soft preference.
      if (requestedAvailable && a.start === new Date(requested!).toISOString())
        return -1;
      if (requestedAvailable && b.start === new Date(requested!).toISOString())
        return 1;

      return (
        Number(b.preferred) - Number(a.preferred) ||
        a.start.localeCompare(b.start)
      );
    })
    .slice(0, 3);

  return {
    status:
      requestedAvailable === false
        ? 'conflict'
        : slots.length
          ? 'available'
          : 'no_slot',
    slots,
    conflicts,
    requestedAvailable,
  };
}
