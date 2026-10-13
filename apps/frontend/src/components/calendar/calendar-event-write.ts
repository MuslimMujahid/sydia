import type {
  CalendarEvent,
  CalendarEventWriteInput,
} from "@/lib/services/api/calendar/calendar.api";

function sameInstant(left: string | null, right: string): boolean {
  return (
    left !== null && new Date(left).getTime() === new Date(right).getTime()
  );
}

function sameAttendees(left: string[], right: string[]): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();

  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((attendee, index) => attendee === sortedRight[index])
  );
}

/** Keep unchanged editor fields out of occurrence writes and override tracking. */
export function changedEventValues(
  event: CalendarEvent,
  values: CalendarEventWriteInput
): Partial<CalendarEventWriteInput> {
  const common = {
    ...(values.recurrence &&
    JSON.stringify(values.recurrence) !== JSON.stringify(event.recurrence)
      ? { recurrence: values.recurrence }
      : {}),
    ...(values.createGoogleMeet !== undefined
      ? { createGoogleMeet: values.createGoogleMeet }
      : {}),
    ...(values.title !== event.title ? { title: values.title } : {}),
    ...(values.description !== event.description
      ? { description: values.description }
      : {}),
    ...(values.location !== event.location
      ? { location: values.location }
      : {}),
    ...(values.attendees && !sameAttendees(values.attendees, event.attendees)
      ? { attendees: values.attendees }
      : {}),
  };

  if ("allDayStartDate" in values) {
    const unchanged =
      event.allDayStartDate !== null &&
      event.allDayEndDate !== null &&
      event.allDayStartDate.slice(0, 10) === values.allDayStartDate &&
      event.allDayEndDate.slice(0, 10) === values.allDayEndDate.slice(0, 10);

    return unchanged
      ? common
      : {
          ...common,
          allDayStartDate: values.allDayStartDate,
          allDayEndDate: values.allDayEndDate,
        };
  }

  const unchanged =
    event.allDayStartDate === null &&
    event.allDayEndDate === null &&
    sameInstant(event.startAt, values.startAt) &&
    sameInstant(event.endAt, values.endAt) &&
    event.timezone === values.timezone;

  return unchanged
    ? common
    : {
        ...common,
        startAt: values.startAt,
        endAt: values.endAt,
        timezone: values.timezone,
      };
}
