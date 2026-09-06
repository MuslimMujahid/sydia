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

function zonedMidnight(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  const estimate = Date.UTC(year, month - 1, day);
  const observed = partsAt(new Date(estimate), timeZone);
  const represented = Date.UTC(
    observed.year ?? year,
    (observed.month ?? month) - 1,
    observed.day ?? day,
    observed.hour ?? 0,
    observed.minute ?? 0,
    observed.second ?? 0,
  );

  return new Date(estimate - (represented - estimate));
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
