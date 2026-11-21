import {
  dayWindow,
  parseTimeOfDay,
  zonedInstant,
  type DayWindow,
} from '../../shared/date-time';

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

/** The briefing schedule fields of a user's notification preferences. */
export type BriefingPreferences = {
  briefingEnabled: boolean;
  weeklyBriefingEnabled: boolean;
  weeklyBriefingDay: number;
};

/** Whether a briefing (daily or weekly) goes out on the local day of `at`. */
export function briefingDay(
  at: Date,
  timezone: string,
  preferences: BriefingPreferences,
): boolean {
  return (
    preferences.briefingEnabled ||
    (preferences.weeklyBriefingEnabled &&
      isWeeklyBriefingDay(at, timezone, preferences.weeklyBriefingDay))
  );
}

/**
 * The next briefing time strictly after `now`, over the coming eight local
 * days; null when no day in that span has a briefing.
 */
export function nextBriefingAt(
  now: Date,
  timezone: string,
  time: string,
  preferences: BriefingPreferences,
): Date | null {
  const minutes = parseTimeOfDay(time) ?? 8 * 60;
  let cursor = now;

  for (let index = 0; index < 8; index += 1) {
    const day = dayWindow(cursor, timezone);
    const [year, month, date] = day.date.split('-').map(Number);
    const at = zonedInstant(
      {
        year: year!,
        month: month!,
        day: date!,
        hour: Math.floor(minutes / 60),
        minute: minutes % 60,
        second: 0,
      },
      timezone,
    );

    if (at > now && briefingDay(at, timezone, preferences)) return at;
    cursor = day.end;
  }

  return null;
}
