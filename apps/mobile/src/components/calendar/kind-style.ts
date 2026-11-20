import type { CalendarEvent } from "@/lib/services/api/calendar/calendar.api";
import { categoryColors, colors } from "@/lib/theme";
import type { ScheduleItemKind } from "./schedule-items";

/**
 * Events and tasks are told apart by hue, as on the web: events violet,
 * tasks amber, both from the aurora stops.
 */
export const KIND_STYLES: Record<
  ScheduleItemKind,
  { label: string; tint: string; soft: string; dot: string }
> = {
  event: {
    label: "Acara",
    tint: categoryColors.violet.foreground,
    soft: categoryColors.violet.background,
    dot: colors.violet,
  },
  task: {
    label: "Tugas",
    tint: categoryColors.amber.foreground,
    soft: categoryColors.amber.background,
    dot: colors.amber,
  },
};

/** The web's sync wording for an event's Google state. */
export function calendarSyncLabel(
  syncState: CalendarEvent["syncState"]
): string {
  switch (syncState) {
    case "local":
      return "Tersimpan di Sydia saja";
    case "pending":
      return "Menunggu sinkronisasi ke Google";
    case "synced":
      return "Tersinkron ke Google";
    case "conflict":
      return "Perlu ditinjau";
    case "error":
      return "Sinkronisasi gagal";
    case "reconnect_required":
      return "Tersimpan di Sydia · Sinkronisasi dijeda";
  }
}

/** A short badge for rows whose sync needs attention; null when fine. */
export function syncBadge(
  event: CalendarEvent
): { label: string; tone: "muted" | "destructive" } | null {
  switch (event.syncState) {
    case "pending":
      return { label: "Menunggu sinkron", tone: "muted" };
    case "conflict":
      return { label: "Perlu ditinjau", tone: "destructive" };
    case "error":
      return { label: "Gagal sinkron", tone: "destructive" };
    case "reconnect_required":
      return { label: "Sinkron dijeda", tone: "muted" };
    default:
      return null;
  }
}
