import type { SupportedLocale } from '../../database/entities';

/** One fixed template per locale, used by notifications that carry no persona. */
export type LocalizedTemplateRegistry = Readonly<
  Record<SupportedLocale, string>
>;

export type TemplateRenderContext = {
  locale: SupportedLocale;
  title?: string;
  notes?: string | null;
  time?: Date | null;
  timezone: string;
};

const PLACEHOLDER = /\{(\w+)\}/gu;

/** Marks a line that survives only alongside the line it labels. */
const OPTIONAL_HEADER = '?';

/**
 * Locale-aware, timezone-correct stamp for `{time}`. Falls back to UTC when the
 * stored zone is not one the runtime recognizes, so a bad profile value can
 * never drop the line entirely.
 */
export function formatNotificationTime(
  time: Date,
  timezone: string,
  locale: SupportedLocale,
): string {
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  };

  try {
    return new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', {
      ...options,
      timeZone: timezone,
    }).format(time);
  } catch {
    return new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', {
      ...options,
      timeZone: 'UTC',
    }).format(time);
  }
}

function lineSurvives(
  line: string,
  hasNotes: boolean,
  hasTime: boolean,
): boolean {
  // Optional lines vanish as a unit so a missing note or due time leaves no
  // dangling label or icon behind.
  if (line.includes('{notes}') && !hasNotes) return false;
  if (line.includes('{time}') && !hasTime) return false;

  return true;
}

/**
 * Renders a single template. A line prefixed with `?` is a header for the line
 * directly beneath it: both survive or both disappear, so `catatan:` never
 * appears above an empty note.
 */
export function renderTemplate(
  template: string,
  context: TemplateRenderContext,
): string {
  const notes = context.notes?.trim();
  const hasNotes = Boolean(notes);
  const hasTime = Boolean(context.time);

  const substitutions: Record<string, string> = {
    title: context.title ?? '',
    time: context.time
      ? formatNotificationTime(context.time, context.timezone, context.locale)
      : '',
    notes: notes ?? '',
  };

  const substitute = (line: string): string =>
    line
      .replace(PLACEHOLDER, (match, key: string) => substitutions[key] ?? match)
      .trimEnd();

  const lines = template.split('\n');

  return lines
    .flatMap((line, index) => {
      if (line.startsWith(OPTIONAL_HEADER)) {
        const labelled = lines[index + 1];

        if (
          labelled === undefined ||
          !lineSurvives(labelled, hasNotes, hasTime)
        )
          return [];

        return [substitute(line.slice(OPTIONAL_HEADER.length))];
      }

      return lineSurvives(line, hasNotes, hasTime) ? [substitute(line)] : [];
    })
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}
