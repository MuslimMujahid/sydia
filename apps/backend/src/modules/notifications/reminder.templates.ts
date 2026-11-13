import type { LocalizedTemplateRegistry } from './notification-templates';

/**
 * Reminder copy is persona-independent: one fixed body per locale. The `?`
 * prefix marks the `catatan:`/`notes:` line as an optional label, so it
 * disappears together with the note line beneath it when a reminder has no
 * notes.
 */
export const REMINDER_TEMPLATES = {
  en: '⏰ Reminder - {title}\n\ntime: {time}\n\n?notes:\n{notes}',
  id: '⏰ Pengingat - {title}\n\nwaktu: {time}\n\n?catatan:\n{notes}',
} as const satisfies LocalizedTemplateRegistry;

/** Important reminders repeat until acknowledged, so they say how to stop them. */
export const IMPORTANT_REMINDER_TEMPLATES = {
  en: "⏰⏰⏰ Important reminder - {title}\n\ntime: {time}\n\n?notes:\n{notes}\n\nReply 'ok' once done, or 'remind me in 15 minutes'.",
  id: "⏰⏰⏰ Pengingat penting - {title}\n\nwaktu: {time}\n\n?catatan:\n{notes}\n\nBalas 'oke' kalau sudah, atau 'ingatkan 15 menit lagi'.",
} as const satisfies LocalizedTemplateRegistry;

/** Suffix appended to the title of repeat N (N ≥ 2). */
export const REMINDER_REPEAT_SUFFIX = {
  en: ' (reminder #{n})',
  id: ' (pengingat ke-{n})',
} as const satisfies LocalizedTemplateRegistry;

export const REMINDER_FINAL_TEMPLATES = {
  en: "I'll stop reminding you about '{title}'. Reply 'remind me in X' if you still need it.",
  id: "Aku berhenti mengingatkan '{title}'. Balas 'ingatkan X lagi' kalau masih perlu.",
} as const satisfies LocalizedTemplateRegistry;
