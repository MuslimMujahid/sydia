import type {
  CalendarEvent,
  CalendarEventWriteInput,
} from "@/lib/services/api/calendar/calendar.api";
import {
  addDays,
  dayKeyInZone,
  minutesOfDayInZone,
  toWallDateTime,
  type DayKey,
} from "./calendar-date";
import { notesToPlainText, plainTextToNotesHtml } from "./event-notes";
import { eventTimeInZone, eventTimeToIso } from "./event-time";

/** Reminder lead times the web editor offers. */
export const EVENT_REMINDER_OPTIONS = [
  { value: 10, label: "10 menit sebelumnya" },
  { value: 15, label: "15 menit sebelumnya" },
  { value: 30, label: "30 menit sebelumnya" },
  { value: 60, label: "1 jam sebelumnya" },
] as const;

export function reminderLabel(minutes: number): string {
  return minutes === 60
    ? "1 jam sebelum acara"
    : minutes % 60 === 0
      ? `${minutes / 60} jam sebelum acara`
      : `${minutes} menit sebelum acara`;
}

/**
 * Everything the event form edits. Timed values are wall times
 * ("yyyy-MM-ddTHH:mm") in the event's calendar time zone, as on the web;
 * all-day dates are inclusive day keys.
 */
export type EventDraft = {
  title: string;
  isAllDay: boolean;
  startAt: string;
  endAt: string;
  allDayStartDate: DayKey;
  allDayEndDate: DayKey;
  location: string;
  /** Notes as plain text; HTML notes are only rewritten once edited. */
  notes: string;
  notesTouched: boolean;
  /** HTML from the rich editor, present only after applying a note edit. */
  notesHtml?: string;
  /** Comma-separated email addresses. */
  attendees: string;
  recurrence: string[];
  reminderMinutes: number;
};

export type EventDraftErrors = Partial<
  Record<"title" | "end" | "attendees", string>
>;

type InitialDraftOptions = {
  event?: CalendarEvent;
  /** The event's calendar time zone (its own, or the profile's for new ones). */
  timezone: string;
  /** Day to prefill a new event on; today when omitted. */
  day?: DayKey;
  now?: Date;
};

/**
 * A new event starts at the next full hour today, or 09.00 on another day,
 * and lasts an hour (the web's `openCreate`).
 */
export function initialEventDraft({
  event,
  timezone,
  day,
  now = new Date(),
}: InitialDraftOptions): EventDraft {
  if (event) {
    const allDay = Boolean(event.allDayStartDate && event.allDayEndDate);
    const startDay = event.allDayStartDate?.slice(0, 10);
    const endDay = event.allDayEndDate
      ? addDays(event.allDayEndDate.slice(0, 10), -1)
      : undefined;
    const startAt = event.startAt
      ? eventTimeInZone(event.startAt, timezone)
      : "";
    const endAt = event.endAt ? eventTimeInZone(event.endAt, timezone) : "";

    return {
      title: event.title,
      isAllDay: allDay,
      startAt: startAt || `${startDay ?? dayKeyInZone(now, timezone)}T09:00`,
      endAt:
        endAt || `${endDay ?? startDay ?? dayKeyInZone(now, timezone)}T10:00`,
      allDayStartDate: startDay ?? startAt.slice(0, 10),
      allDayEndDate: endDay ?? (endAt || startAt).slice(0, 10),
      location: event.location ?? "",
      notes: notesToPlainText(event.description),
      notesTouched: false,
      attendees: event.attendees.join(", "),
      recurrence: event.recurrence,
      reminderMinutes: event.reminderMinutes ?? 10,
    };
  }

  const todayKey = dayKeyInZone(now, timezone);
  const dayKey = day ?? todayKey;
  const nextHour = Math.min(
    (Math.floor(minutesOfDayInZone(now, timezone) / 60) + 1) * 60,
    23 * 60
  );
  const start = dayKey === todayKey ? nextHour : 9 * 60;

  return {
    title: "",
    isAllDay: false,
    startAt: toWallDateTime(dayKey, start),
    endAt: toWallDateTime(dayKey, Math.min(start + 60, 24 * 60 - 1)),
    allDayStartDate: dayKey,
    allDayEndDate: dayKey,
    location: "",
    notes: "",
    notesTouched: false,
    attendees: "",
    recurrence: [],
    reminderMinutes: 10,
  };
}

function wallMs(value: string): number {
  return new Date(`${value}:00Z`).getTime();
}

function msToWall(value: number): string {
  return new Date(value).toISOString().slice(0, 16);
}

/** Moving the start keeps the event's length, as calendar apps do. */
export function moveStart(draft: EventDraft, startAt: string): EventDraft {
  const duration = Math.max(wallMs(draft.endAt) - wallMs(draft.startAt), 0);
  const start = wallMs(startAt);
  if (!Number.isFinite(start) || !Number.isFinite(duration))
    return { ...draft, startAt };

  return {
    ...draft,
    startAt,
    endAt: msToWall(start + (duration || 3_600_000)),
  };
}

/** Moving the first all-day date keeps the number of days. */
export function moveAllDayStart(
  draft: EventDraft,
  startDate: DayKey
): EventDraft {
  const length = Math.max(
    Math.round(
      (wallMs(`${draft.allDayEndDate}T00:00`) -
        wallMs(`${draft.allDayStartDate}T00:00`)) /
        86_400_000
    ),
    0
  );

  return {
    ...draft,
    allDayStartDate: startDate,
    allDayEndDate: addDays(startDate, length),
  };
}

/** Switching between timed and all-day carries the chosen days across. */
export function toggleAllDay(draft: EventDraft, isAllDay: boolean): EventDraft {
  if (isAllDay)
    return {
      ...draft,
      isAllDay,
      allDayStartDate: draft.startAt.slice(0, 10),
      allDayEndDate: draft.endAt.slice(0, 10) || draft.startAt.slice(0, 10),
    };

  return {
    ...draft,
    isAllDay,
    startAt: `${draft.allDayStartDate}T${draft.startAt.slice(11) || "09:00"}`,
    endAt: `${draft.allDayEndDate}T${draft.endAt.slice(11) || "10:00"}`,
  };
}

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Unique, trimmed attendee emails from a comma or space separated list. */
export function parseAttendees(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,;\s]+/)
        .map((email) => email.trim())
        .filter(Boolean)
    ),
  ];
}

export function validateEventDraft(draft: EventDraft): EventDraftErrors {
  const errors: EventDraftErrors = {};

  if (draft.title.trim().length < 2)
    errors.title = "Masukkan judul minimal 2 karakter.";

  if (draft.isAllDay) {
    if (!draft.allDayStartDate || !draft.allDayEndDate)
      errors.end = "Pilih tanggal mulai dan selesai.";
    else if (draft.allDayEndDate < draft.allDayStartDate)
      errors.end = "Tanggal selesai harus sama atau setelah tanggal mulai.";
  } else if (!draft.startAt || !draft.endAt)
    errors.end = "Pilih waktu mulai dan selesai.";
  else if (wallMs(draft.endAt) <= wallMs(draft.startAt))
    errors.end = "Waktu selesai harus setelah waktu mulai.";

  if (!parseAttendees(draft.attendees).every((email) => EMAIL.test(email)))
    errors.attendees = "Masukkan alamat email peserta yang valid.";

  return errors;
}

type WriteOptions = {
  timezone: string;
  /** The stored description, kept as-is unless the notes were edited. */
  originalDescription?: string | null;
  /** Sent only for Google-backed events, like the web. */
  createGoogleMeet?: boolean;
  includeReminder?: boolean;
};

/**
 * The create/update payload for a valid draft (the web's form submit).
 * Throws when a wall time does not exist in the calendar time zone.
 */
export function eventDraftToWrite(
  draft: EventDraft,
  {
    timezone,
    originalDescription = null,
    createGoogleMeet,
    includeReminder = true,
  }: WriteOptions
): CalendarEventWriteInput {
  const description = draft.notesTouched
    ? (draft.notesHtml ?? plainTextToNotesHtml(draft.notes)) || null
    : originalDescription;

  const common = {
    title: draft.title.trim(),
    ...(includeReminder ? { reminderMinutes: draft.reminderMinutes } : {}),
    recurrence: draft.recurrence,
    ...(createGoogleMeet !== undefined ? { createGoogleMeet } : {}),
    location: draft.location.trim() || null,
    description,
    attendees: parseAttendees(draft.attendees),
  };

  if (draft.isAllDay)
    return {
      ...common,
      allDayStartDate: draft.allDayStartDate,
      allDayEndDate: addDays(draft.allDayEndDate, 1),
    };

  return {
    ...common,
    startAt: eventTimeToIso(draft.startAt, timezone),
    endAt: eventTimeToIso(draft.endAt, timezone),
    timezone,
  };
}
