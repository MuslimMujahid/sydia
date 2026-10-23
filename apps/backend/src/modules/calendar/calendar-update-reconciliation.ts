import type { CalendarEventWrite } from '../../database/entities';

type FieldGroup =
  'title' | 'description' | 'location' | 'time' | 'attendees' | 'status';

export type CalendarEditClock = {
  localEditedAt: Date | null;
  remoteEditedAt: Date | null;
};

export type CalendarAutomaticResolution = {
  patch: Partial<CalendarEventWrite>;
  recovery: {
    fields: FieldGroup[];
    winner: 'local' | 'remote';
    reason: 'later_edit' | 'equal_timestamp' | 'unknown_timestamp';
    local: CalendarEventWrite;
    remote: CalendarEventWrite;
  } | null;
};

/**
 * Google exposes an event clock, not a field clock. Only overlapping groups
 * use that clock; independent edits always survive. Unknown/equal clocks favor
 * the observed provider version, retaining both versions for recovery.
 * Callers must persist recovery before applying the returned patch.
 */
export function resolveCalendarUpdate(
  base: CalendarEventWrite,
  desired: CalendarEventWrite,
  remote: CalendarEventWrite,
  clock: CalendarEditClock,
): CalendarAutomaticResolution {
  const result = reconcileCalendarUpdate(base, desired, remote);
  if (result.status === 'ready') return { patch: result.patch, recovery: null };

  const localTime = clock.localEditedAt?.getTime();
  const remoteTime = clock.remoteEditedAt?.getTime();
  const known =
    localTime !== undefined &&
    remoteTime !== undefined &&
    Number.isFinite(localTime) &&
    Number.isFinite(remoteTime);

  const winner = known && localTime > remoteTime ? 'local' : 'remote';

  // Rebase only conflicting groups. The original comparison has already
  // established which groups changed independently on each side.
  const rebased = { ...base };
  const target = { ...desired };

  for (const field of result.fields) {
    copyGroup(rebased, remote, field);
    if (winner === 'remote') copyGroup(target, remote, field);
  }

  const resolved = reconcileCalendarUpdate(rebased, target, remote);
  if (resolved.status !== 'ready')
    throw new Error(
      'Automatic calendar reconciliation left unresolved fields.',
    );

  return {
    patch: resolved.patch,
    recovery: {
      fields: result.fields,
      winner,
      reason: !known
        ? 'unknown_timestamp'
        : localTime === remoteTime
          ? 'equal_timestamp'
          : 'later_edit',
      local: desired,
      remote,
    },
  };
}

function copyGroup(
  target: CalendarEventWrite,
  source: CalendarEventWrite,
  field: FieldGroup,
): void {
  if (field === 'time') {
    Object.assign(target, {
      startAt: source.startAt,
      endAt: source.endAt,
      timezone: source.timezone,
      allDayStartDate: source.allDayStartDate,
      allDayEndDate: source.allDayEndDate,
      recurrence: source.recurrence,
    });
  } else if (field === 'title') target.title = source.title;
  else if (field === 'description') target.description = source.description;
  else if (field === 'location') target.location = source.location;
  else if (field === 'attendees') target.attendees = source.attendees;
  else target.status = source.status;
}

const GROUPS: readonly FieldGroup[] = [
  'title',
  'description',
  'location',
  'time',
  'attendees',
  'status',
];

function groups(event: CalendarEventWrite): Record<FieldGroup, unknown> {
  return {
    title: event.title,
    description: event.description === '' ? null : (event.description ?? null),
    location: event.location === '' ? null : (event.location ?? null),
    time: event.allDayStartDate
      ? [
          event.allDayStartDate.toISOString(),
          event.allDayEndDate?.toISOString(),
          [...(event.recurrence ?? [])].sort(),
        ]
      : [
          event.startAt?.toISOString(),
          event.endAt?.toISOString(),
          event.timezone,
          [...(event.recurrence ?? [])].sort(),
        ],
    attendees: [...(event.attendees ?? [])].sort(),
    status: event.status ?? 'confirmed',
  };
}

export function reconcileCalendarUpdate(
  base: CalendarEventWrite,
  desired: CalendarEventWrite,
  remote: CalendarEventWrite,
):
  | { status: 'ready'; patch: Partial<CalendarEventWrite> }
  | { status: 'conflict'; fields: FieldGroup[] } {
  const baseline = groups(base);
  const wanted = groups(desired);
  const observed = groups(remote);
  const remaining: FieldGroup[] = [];
  const conflicts: FieldGroup[] = [];

  for (const group of GROUPS) {
    const desiredValue = JSON.stringify(wanted[group]);
    const baseValue = JSON.stringify(baseline[group]);
    const remoteValue = JSON.stringify(observed[group]);
    if (desiredValue === baseValue || desiredValue === remoteValue) continue;
    if (remoteValue !== baseValue) conflicts.push(group);
    else remaining.push(group);
  }

  if (conflicts.length) return { status: 'conflict', fields: conflicts };

  const patch: Partial<CalendarEventWrite> = {};

  for (const group of remaining) {
    switch (group) {
      case 'title':
        patch.title = desired.title;
        break;
      case 'description':
        patch.description = desired.description ?? null;
        break;
      case 'location':
        patch.location = desired.location ?? null;
        break;
      case 'attendees':
        patch.attendees = desired.attendees ?? [];
        break;
      case 'status':
        patch.status = desired.status ?? 'confirmed';
        break;
      case 'time':
        Object.assign(
          patch,
          desired.allDayStartDate
            ? {
                allDayStartDate: desired.allDayStartDate,
                allDayEndDate: desired.allDayEndDate,
                recurrence: desired.recurrence ?? [],
              }
            : {
                startAt: desired.startAt,
                endAt: desired.endAt,
                timezone: desired.timezone,
                recurrence: desired.recurrence ?? [],
              },
        );
        break;
    }
  }

  return { status: 'ready', patch };
}
