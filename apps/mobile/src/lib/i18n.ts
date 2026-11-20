import type { SupportedLocale } from "@/lib/services/api/users/users.api";

let currentLocale: SupportedLocale = "id";

/** Set from the signed-in profile so non-React code can pick its copy. */
export function setAppLocale(locale: SupportedLocale) {
  currentLocale = locale;
}

export function getAppLocale(): SupportedLocale {
  return currentLocale;
}

/** Picks the Indonesian or English variant of a string for the app locale. */
export function localized(indonesian: string, english: string): string {
  return currentLocale === "en" ? english : indonesian;
}
