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
