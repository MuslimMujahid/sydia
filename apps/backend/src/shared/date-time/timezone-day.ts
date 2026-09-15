export type DayWindow = {
  date: string;
  start: Date;
  end: Date;
};

function partsAt(instant: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}

/** Calendar fields as the user's zone shows them; all values are numbers. */
export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = partsAt(instant, timeZone);

  return {
    year: parts.year ?? instant.getUTCFullYear(),
    month: parts.month ?? instant.getUTCMonth() + 1,
    day: parts.day ?? instant.getUTCDate(),
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

/**
 * The instant at which the user's zone shows the supplied wall clock.
 *
 * The offset is read back from the zone itself rather than assumed, so the
 * result is correct for any offset, including zones with daylight saving at the
 * moment of the call. A wall clock that the zone skips or repeats is resolved
 * to the first instant that matches it.
 */
export function zonedInstant(parts: ZonedParts, timeZone: string): Date {
  const estimate = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  const observed = partsAt(new Date(estimate), timeZone);
  const represented = Date.UTC(
    observed.year ?? parts.year,
    (observed.month ?? parts.month) - 1,
    observed.day ?? parts.day,
    observed.hour ?? parts.hour,
    observed.minute ?? parts.minute,
    observed.second ?? parts.second,
  );

  return new Date(estimate - (represented - estimate));
}

function zonedMidnight(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  return zonedInstant(
    { year, month, day, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
}

export function dayWindow(now: Date, timeZone: string): DayWindow {
  const parts = partsAt(now, timeZone);
  const year = parts.year ?? now.getUTCFullYear();
  const month = parts.month ?? now.getUTCMonth() + 1;
  const day = parts.day ?? now.getUTCDate();
  const start = zonedMidnight(year, month, day, timeZone);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
  const end = zonedMidnight(
    nextDate.getUTCFullYear(),
    nextDate.getUTCMonth() + 1,
    nextDate.getUTCDate(),
    timeZone,
  );

  return {
    date: `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
    start,
    end,
  };
}
