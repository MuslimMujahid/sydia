function wallTimeParts(instant: Date, timezone: string): string {
  const parts = new Map(
    new Intl.DateTimeFormat("en-CA", {
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

  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}T${parts.get("hour")}:${parts.get("minute")}`;
}

export function eventTimeInZone(value: string, timezone: string): string {
  return wallTimeParts(new Date(value), timezone);
}

/** Resolve the editor's wall time in its calendar time zone, including DST. */
export function eventTimeToIso(value: string, timezone: string): string {
  const desired = new Date(`${value}:00Z`).getTime();
  if (!Number.isFinite(desired))
    throw new Error("Pilih tanggal dan waktu yang valid.");
  let instant = desired;

  for (let attempt = 0; attempt < 3; attempt++) {
    const represented = new Date(
      `${wallTimeParts(new Date(instant), timezone)}:00Z`
    ).getTime();

    instant += desired - represented;
  }

  if (wallTimeParts(new Date(instant), timezone) !== value)
    throw new Error(
      "Waktu ini tidak tersedia di zona waktu acara. Pilih waktu lain."
    );

  return new Date(instant).toISOString();
}
