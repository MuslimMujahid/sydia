import type { SupportedLocale } from "@/lib/services/api/users/users.queries";

/** Hour of the day (0-23) in the given IANA timezone. */
export function hourInZone(now: Date, timezone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: timezone,
  }).format(now);

  return Number(hour);
}

/** Time-of-day greeting, addressed to the user's first name when known. */
export function chatGreeting(
  hour: number,
  locale: SupportedLocale,
  name?: string
): string {
  const firstName = name?.trim().split(/\s+/)[0];
  const greeting =
    locale === "en"
      ? hour >= 4 && hour < 12
        ? "Good morning"
        : hour >= 12 && hour < 18
          ? "Good afternoon"
          : "Good evening"
      : hour >= 4 && hour < 11
        ? "Selamat pagi"
        : hour >= 11 && hour < 15
          ? "Selamat siang"
          : hour >= 15 && hour < 18
            ? "Selamat sore"
            : "Selamat malam";

  return firstName ? `${greeting}, ${firstName}` : greeting;
}
