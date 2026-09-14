import type {
  AssistantPersona,
  SupportedLocale,
  TaskPriority,
} from '../../database/entities';

/**
 * Randomness source for template selection. Injected so tests can pin the
 * variant that a persona and locale resolve to.
 */
export const NOTIFICATION_RANDOM = Symbol('NotificationRandom');
export type Random = () => number;

/** Persona- and locale-keyed variant lists, used by follow-up notifications. */
export type PersonaTemplateRegistry = Readonly<
  Record<AssistantPersona, Readonly<Record<SupportedLocale, readonly string[]>>>
>;

/** One fixed template per locale, used by notifications that carry no persona. */
export type LocalizedTemplateRegistry = Readonly<
  Record<SupportedLocale, string>
>;

export type TemplateRenderContext = {
  locale: SupportedLocale;
  title?: string;
  notes?: string | null;
  items?: string;
  time?: Date | null;
  timezone: string;
};

export type PersonaTemplateContext = TemplateRenderContext & {
  persona: AssistantPersona;
};

export const TASK_PRIORITY_LABELS: Record<
  SupportedLocale,
  Record<TaskPriority, string>
> = {
  en: { low: 'Low', medium: 'Medium', high: 'High' },
  id: { low: 'Rendah', medium: 'Sedang', high: 'Tinggi' },
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

function variantIndex(count: number, random: Random): number {
  const value = random();
  const bounded = Number.isFinite(value)
    ? Math.min(Math.max(value, 0), 0.999_999)
    : 0;

  return Math.floor(bounded * count);
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
    items: context.items ?? '',
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

/**
 * Renders one variant of a persona+locale registry entry. Selection is uniform
 * over the variant list; a missing or malformed locale falls back to the `en`
 * list and a missing persona to `professional`, so a profile value can never
 * produce an empty notification body.
 */
export function renderNotificationMessage(
  registry: PersonaTemplateRegistry,
  context: PersonaTemplateContext,
  random: Random = Math.random,
): string {
  const localized = registry[context.persona]?.[context.locale];
  const variants =
    localized && localized.length > 0 ? localized : registry.professional.en;

  const template =
    variants[variantIndex(variants.length, random)] ?? variants[0] ?? '';

  return renderTemplate(template, context);
}
