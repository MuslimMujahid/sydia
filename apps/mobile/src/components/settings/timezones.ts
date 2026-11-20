import { zonedParts } from "@/lib/utils/date-time";

/** The zone the backend gives every new account (User.timezone default). */
export const SERVER_DEFAULT_TIMEZONE = "Asia/Jakarta";

/** Indonesia's three zones, shown first with their everyday names. */
export const INDONESIAN_TIME_ZONES: Record<string, string> = {
  "Asia/Jakarta": "WIB",
  "Asia/Makassar": "WITA",
  "Asia/Jayapura": "WIT",
};

/**
 * Used when the JS engine cannot list IANA zones (older Hermes builds lack
 * `Intl.supportedValuesOf`). Covers the zones Sydia users pick in practice.
 */
const FALLBACK_TIME_ZONES = [
  "Asia/Jakarta",
  "Asia/Pontianak",
  "Asia/Makassar",
  "Asia/Jayapura",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Bangkok",
  "Asia/Ho_Chi_Minh",
  "Asia/Manila",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Taipei",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Karachi",
  "Asia/Dhaka",
  "Australia/Perth",
  "Australia/Darwin",
  "Australia/Brisbane",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "Europe/London",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Istanbul",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "UTC",
];

type IntlWithZones = typeof Intl & {
  supportedValuesOf?: (key: "timeZone") => string[];
};

/** Every IANA zone the device knows, always including UTC. */
export function listTimeZones(): string[] {
  const intl = Intl as IntlWithZones;
  let zones: string[] = [];

  try {
    zones =
      typeof intl.supportedValuesOf === "function"
        ? intl.supportedValuesOf("timeZone")
        : [];
  } catch (error) {
    console.warn("Time zone list is unavailable; using the short list", error);
    // Degraded mode: the curated list below still covers common choices.
  }

  const source = zones.length > 0 ? zones : FALLBACK_TIME_ZONES;

  return [...new Set([...source, "UTC"])].sort((left, right) =>
    left.localeCompare(right)
  );
}

/**
 * The device's IANA zone, e.g. Asia/Makassar. Placeholder names such as
 * Etc/Unknown or a bare offset are ignored, mirroring the web onboarding.
 */
export function usableDeviceTimeZone(
  zone: string | undefined = Intl.DateTimeFormat().resolvedOptions().timeZone
): string | null {
  return zone &&
    (zone === "UTC" || /^[A-Z][A-Za-z_]+\//.test(zone)) &&
    !zone.startsWith("Etc/")
    ? zone
    : null;
}

/** "Jakarta", "Kuala Lumpur", "Argentina / Buenos Aires" for a zone id. */
export function timeZoneCity(zone: string): string {
  if (zone === "UTC") return "UTC";
  const [, ...rest] = zone.split("/");

  return (rest.length > 0 ? rest : [zone])
    .map((part) => part.replaceAll("_", " "))
    .join(" / ");
}

/** "GMT+7", "GMT+5:30", "GMT−3", or "GMT" for the zone's current offset. */
export function utcOffsetLabel(zone: string, now: Date = new Date()): string {
  try {
    const parts = zonedParts(now, zone);
    const wall = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute
    );
    const minutes = Math.round(
      (wall - Math.floor(now.getTime() / 60_000) * 60_000) / 60_000
    );
    if (minutes === 0) return "GMT";
    const sign = minutes > 0 ? "+" : "−";
    const absolute = Math.abs(minutes);
    const hours = Math.floor(absolute / 60);
    const rest = absolute % 60;

    return `GMT${sign}${hours}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
  } catch (error) {
    console.warn("Time zone offset could not be read", { zone, error });

    return "";
  }
}

/** One-line label for a zone row: "WIB · Jakarta" or "Kuala Lumpur". */
export function timeZoneTitle(zone: string): string {
  const short = INDONESIAN_TIME_ZONES[zone];
  const city = timeZoneCity(zone);

  return short ? `${short} · ${city}` : city;
}

function normalize(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ").trim();
}

/** Case-insensitive match on the zone id, city, and Indonesian short name. */
export function searchTimeZones(zones: string[], query: string): string[] {
  const needle = normalize(query);
  if (!needle) return zones;

  return zones.filter((zone) => {
    const haystack = normalize(
      `${zone} ${INDONESIAN_TIME_ZONES[zone] ?? ""} ${timeZoneCity(zone)}`
    );

    return haystack.includes(needle);
  });
}
