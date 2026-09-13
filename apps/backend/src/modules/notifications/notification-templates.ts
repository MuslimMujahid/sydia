import type {
  AssistantPersona,
  SupportedLocale,
} from '../../database/entities';

/**
 * Randomness source for template selection. Injected so tests can pin the
 * variant that a persona and locale resolve to.
 */
export const NOTIFICATION_RANDOM = Symbol('NotificationRandom');
export type Random = () => number;

/** Every persona must offer this many variants per locale. */
export const TEMPLATE_VARIANTS_PER_PERSONA = 5;

export type NotificationTemplateRegistry = Readonly<
  Record<AssistantPersona, Readonly<Record<SupportedLocale, readonly string[]>>>
>;

export type FollowUpKind = 'task' | 'reminder';

export type NotificationTemplateContext = {
  persona: AssistantPersona;
  locale: SupportedLocale;
  title: string;
  notes?: string | null;
  time?: Date | null;
  timezone: string;
  /** Only the follow-up registry reads `{kind}`. */
  kind?: FollowUpKind;
};

const FOLLOW_UP_NOUNS: Record<SupportedLocale, Record<FollowUpKind, string>> = {
  en: { task: 'task', reminder: 'reminder' },
  id: { task: 'tugas', reminder: 'pengingat' },
};

const PLACEHOLDER = /\{(\w+)\}/gu;

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

/**
 * Renders one variant of a registry entry. Selection is uniform over the
 * persona+locale variant list; a missing or malformed locale falls back to the
 * `en` list and a missing persona to `professional`, so a profile value can
 * never produce an empty notification body.
 */
export function renderNotificationMessage(
  registry: NotificationTemplateRegistry,
  context: NotificationTemplateContext,
  random: Random = Math.random,
): string {
  const localized = registry[context.persona]?.[context.locale];
  const variants =
    localized && localized.length > 0 ? localized : registry.professional.en;

  const template =
    variants[variantIndex(variants.length, random)] ?? variants[0] ?? '';

  const notes = context.notes?.trim();
  const substitutions: Record<string, string> = {
    title: context.title,
    time: context.time
      ? formatNotificationTime(context.time, context.timezone, context.locale)
      : '',
    notes: notes ?? '',
    kind: context.kind
      ? FOLLOW_UP_NOUNS[context.locale][context.kind]
      : FOLLOW_UP_NOUNS.en.task,
  };

  const rendered = template
    .split('\n')
    .flatMap((line) => {
      // Optional lines vanish as a unit so a missing note or due time leaves no
      // dangling icon behind.
      if (line.includes('{notes}') && !notes) return [];
      if (line.includes('{time}') && !context.time) return [];

      return [
        line
          .replace(
            PLACEHOLDER,
            (match, key: string) => substitutions[key] ?? match,
          )
          .trimEnd(),
      ];
    })
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();

  return rendered;
}
