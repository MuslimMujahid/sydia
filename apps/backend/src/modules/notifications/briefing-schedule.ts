import { dayWindow, type DayWindow } from '../../shared/date-time';

/** ISO weekday in the account's timezone, independent of the server's zone. */
export function isWeeklyBriefingDay(
  now: Date,
  timezone: string,
  weekday: number,
): boolean {
  const { date } = dayWindow(now, timezone);
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();

  return (day === 0 ? 7 : day) === weekday;
}

/** Advance by local midnights so a DST week still contains seven calendar days. */
export function briefingDayWindows(now: Date, timezone: string): DayWindow[] {
  const days = [dayWindow(now, timezone)];

  for (let index = 1; index < 7; index += 1) {
    days.push(dayWindow(days[index - 1]!.end, timezone));
  }

  return days;
}
