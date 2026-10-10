import type { CalendarEventWrite } from '../../database/entities';

type FieldGroup =
  'title' | 'description' | 'location' | 'time' | 'attendees' | 'status';
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
