import { PopoverTitle } from "@/components/ui/popover";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";
import type { ChatEntity } from "./chat-entities";
import {
  formatAllDayEventRange,
  formatEntityRecurrence,
} from "./entity-format";

/** Preview pills inspect confirmed tool snapshots without calling real-user APIs. */
export function EntitySnapshotDetails({
  entity,
  locale,
  timezone,
}: {
  entity: ChatEntity;
  locale: SupportedLocale;
  timezone: string;
}) {
  const when = (value: string, zone = timezone) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: zone,
    }).format(new Date(value));

  const details: string[] = [];

  if (entity.kind === "note") {
    if (entity.path) details.push(entity.path);
    if (entity.updatedAt) details.push(when(entity.updatedAt));
  }

  if ("status" in entity && entity.status) details.push(entity.status);
  if (entity.kind === "task" && entity.dueAt) details.push(when(entity.dueAt));

  if (entity.kind === "reminder") {
    if (entity.scheduledAt)
      details.push(when(entity.scheduledAt, entity.timezone ?? timezone));
    const recurrence = formatEntityRecurrence(
      entity.recurrence ?? null,
      locale
    );

    if (recurrence) details.push(recurrence);
  }

  if (entity.kind === "event") {
    if (entity.allDayStartDate && entity.allDayEndDate)
      details.push(
        formatAllDayEventRange(
          entity.allDayStartDate,
          entity.allDayEndDate,
          locale
        )
      );
    else if (entity.startAt && entity.endAt && entity.timezone)
      details.push(
        `${when(entity.startAt, entity.timezone)} – ${when(entity.endAt, entity.timezone)}`
      );
    if (entity.location) details.push(entity.location);
  }

  if (entity.kind === "file" && entity.mimeType) details.push(entity.mimeType);

  return (
    <>
      <PopoverTitle className="break-words">{entity.title}</PopoverTitle>
      {details.map((detail) => (
        <p key={detail} className="mt-2 text-sm text-ink-muted">
          {detail}
        </p>
      ))}
      <p className="mt-3 text-xs text-ink-muted">
        {locale === "en"
          ? "Snapshot from this test response. Update it through the message box."
          : "Rincian dari respons pengujian ini. Ubah melalui kotak pesan."}
      </p>
    </>
  );
}
