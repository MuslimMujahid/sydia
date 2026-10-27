import type { LocalizedTemplateRegistry } from './notification-templates';

/**
 * Google Meet follow-up copy is persona-independent: one fixed line per locale
 * and outcome. The chat receipt already promised this message, so the wording
 * stays literal and actionable rather than conversational.
 */
export const GOOGLE_MEET_READY_TEMPLATES = {
  en: 'Your Google Meet link for "{title}" is ready: {url}',
  id: 'Link Google Meet untuk "{title}" sudah siap: {url}',
} as const satisfies LocalizedTemplateRegistry;

export const GOOGLE_MEET_FAILED_TEMPLATES = {
  en: `Couldn't create the Google Meet link for "{title}". Ask me to try again.`,
  id: 'Link Google Meet untuk "{title}" gagal dibuat. Minta saya coba lagi, ya.',
} as const satisfies LocalizedTemplateRegistry;

const PLACEHOLDER = /\{(title|url)\}/gu;

/**
 * Fills the Meet placeholders in a single pass, so an event title containing
 * `{url}` cannot inject or displace the link.
 */
export function renderGoogleMeetTemplate(
  template: string,
  values: { title: string; url: string },
): string {
  return template.replace(PLACEHOLDER, (_match, key: string) =>
    key === 'title' ? values.title : values.url,
  );
}
