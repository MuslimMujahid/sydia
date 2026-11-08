/**
 * A day or period the latest message limits itself to, stated relative to now
 * ("hari ini", "minggu lalu"). The decision model only names the period; the
 * dates come from the owner's local calendar here, so the main model gets
 * them as facts instead of having to notice the wording. Weeks start Monday,
 * as record queries do.
 */
export const DAY_SCOPES = [
  'today',
  'yesterday',
  'tomorrow',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
] as const;

export type DayScope = (typeof DAY_SCOPES)[number];

export function isDayScope(value: unknown): value is DayScope {
  return DAY_SCOPES.includes(value as DayScope);
}

const LABELS: Record<DayScope, string> = {
  today: 'today',
  yesterday: 'yesterday',
  tomorrow: 'tomorrow',
  this_week: 'this week',
  last_week: 'last week',
  this_month: 'this month',
  last_month: 'last month',
};

/** Calendar arithmetic on YYYY-MM-DD keys; noon UTC avoids DST edges. */
function shift(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function monthStart(day: string, months: number): string {
  const [year, month] = day.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, month - 1 + months, 1, 12));

  return date.toISOString().slice(0, 10);
}

/** Inclusive local date range of a scope, given the owner's local today. */
export function dayScopeRange(
  scope: DayScope,
  today: string,
): { from: string; to: string } {
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = shift(today, -weekday);

  switch (scope) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday':
      return { from: shift(today, -1), to: shift(today, -1) };
    case 'tomorrow':
      return { from: shift(today, 1), to: shift(today, 1) };
    case 'this_week':
      return { from: monday, to: shift(monday, 6) };
    case 'last_week':
      return { from: shift(monday, -7), to: shift(monday, -1) };
    case 'this_month':
      return {
        from: monthStart(today, 0),
        to: shift(monthStart(today, 1), -1),
      };
    case 'last_month':
      return {
        from: monthStart(today, -1),
        to: shift(monthStart(today, 0), -1),
      };
  }
}

/** Turn-context line naming the period and its dates. */
export function dayScopeContext(scope: DayScope, today: string): string {
  const { from, to } = dayScopeRange(scope, today);
  const dates = from === to ? from : `${from} to ${to}`;

  return `The latest message is limited to ${LABELS[scope]} (${dates}, owner's local calendar). Saved entries dated outside it are not part of what it asks for.`;
}

/** Upper bound of the line above, reserved in the context budget. */
export const DAY_SCOPE_CONTEXT_SAMPLE = dayScopeContext(
  'this_month',
  '2026-11-08',
);
