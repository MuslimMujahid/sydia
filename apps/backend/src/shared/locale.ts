import type { SupportedLocale } from '../database/entities';

/**
 * Language name carried in model prompts. Models reliably follow a language
 * *name*; a bare two-letter code such as `id` reads as an identifier and is
 * easily ignored, which shows up as mixed-language replies.
 */
export const LANGUAGE_NAMES: Record<SupportedLocale, string> = {
  id: 'Indonesian',
  en: 'English',
};

/** Narrows an arbitrary stored profile value to a supported locale. */
export function localeOf(locale: string | null | undefined): SupportedLocale {
  return locale === 'id' ? 'id' : 'en';
}

/** Language name for an arbitrary stored profile value. */
export function languageOf(locale: string | null | undefined): string {
  return LANGUAGE_NAMES[localeOf(locale)];
}
