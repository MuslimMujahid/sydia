/**
 * Wall-time conversion for event editing, ported from the web. A wall time is
 * "yyyy-MM-ddTHH:mm" in the event's calendar time zone.
 */
function wallTimeParts(instant: Date, timezone: string): string {
  const parts = new Map(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value])
  );
  const hour = parts.get("hour") === "24" ? "00" : parts.get("hour");

  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}T${hour}:${parts.get("minute")}`;
}

export function eventTimeInZone(value: string, timezone: string): string {
  return wallTimeParts(new Date(value), timezone);
}

type EventTimeResult =
  { ok: true; iso: string } | { ok: false; message: string };

/** Resolve a wall time in its calendar time zone, including DST. */
export function eventTimeResult(
  value: string,
  timezone: string
): EventTimeResult {
  const desired = new Date(`${value}:00Z`).getTime();
  if (!Number.isFinite(desired))
    return { ok: false, message: "Pilih tanggal dan waktu yang valid." };
  let instant = desired;

  for (let attempt = 0; attempt < 3; attempt++) {
    const represented = new Date(
      `${wallTimeParts(new Date(instant), timezone)}:00Z`
    ).getTime();

    instant += desired - represented;
  }

  if (wallTimeParts(new Date(instant), timezone) !== value)
    return {
      ok: false,
      message:
        "Waktu ini tidak tersedia di zona waktu acara. Pilih waktu lain.",
    };

  return { ok: true, iso: new Date(instant).toISOString() };
}

export function eventTimeToIso(value: string, timezone: string): string {
  const result = eventTimeResult(value, timezone);
  if (!result.ok) throw new Error(result.message);

  return result.iso;
}
