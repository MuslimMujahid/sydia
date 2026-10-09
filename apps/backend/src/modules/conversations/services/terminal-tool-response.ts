import { Logger } from '@nestjs/common';
import type { JSONSchema7 } from 'ai';
import type { SupportedLocale } from '../../../database/entities';
import type { MessageProvider } from '../../../shared/messaging';
import type { AssistantToolDefinition } from './tool-executor.service';

/**
 * Tools whose successful result fully answers the user's request, so the turn
 * can end with a deterministic acknowledgement instead of a second model call.
 *
 * Memory mutations continue through the model so the assistant can respond to
 * the user conversationally while retention or erasure runs in the background.
 *
 * Every name here has a formatter in `FORMATTER_ENTRIES`; the exhaustiveness
 * check on that record keeps the set and the copy from drifting apart.
 */
const TERMINAL_TOOL_NAME_LIST = [
  'create_task',
  'update_task',
  'update_category',
  'delete_category',
  'create_reminder',
  'update_reminder',
  'delete_reminder',
  'store_secret',
  'create_secret_reveal_link',
  'save_contact',
  'create_contact_group',
  'update_contact_group',
  'delete_contact_group',
  'assign_contact_groups',
  'save_attached_files',
  'send_file',
  'create_calendar_event',
  'update_calendar_event',
  'cancel_calendar_event',
  'write_daily_note',
] as const;

export type TerminalToolName = (typeof TERMINAL_TOOL_NAME_LIST)[number];

export const TERMINAL_TOOL_NAMES: ReadonlySet<string> = new Set(
  TERMINAL_TOOL_NAME_LIST,
);

type TaskToolName = 'create_task' | 'update_task';

function isTaskTool(name: string): name is TaskToolName {
  return name === 'create_task' || name === 'update_task';
}

/**
 * One tool execution of a completed model step, as the orchestrator observed
 * it: the original call identity, the arguments the model sent (with the
 * `completeTurn` flag still present) and the result the tool returned in
 * memory. `result` is never the persisted, masked result.
 */
export type TerminalToolExecution = {
  toolCallId: string;
  toolName: string;
  arguments: unknown;
  result: unknown;
};

const COMPLETE_TURN_DESCRIPTION =
  'Set to false only when another tool call must still run after this one, because this call alone cannot finish the user request — a reminder split (update a recurring reminder, then create the remaining schedules, or vice versa), creating a contact group before assigning contacts, or a save/process/send chain (save files, then send one, or save a file, then read it). Leave it unset otherwise: a short confirmation is generated for you from the result, so do not set false merely to add commentary, restate the result, or offer follow-up suggestions. Several independent calls that together finish the request all keep the default.';

/**
 * Model-facing input schema for one tool. Eligible tools gain the optional
 * orchestration flag `completeTurn`; every other tool is handed back its own
 * schema object untouched, so a non-eligible call can never opt in to ending
 * the turn.
 */
export function terminalToolInputSchema(
  definition: AssistantToolDefinition,
): JSONSchema7 {
  if (!TERMINAL_TOOL_NAMES.has(definition.name)) return definition.parameters;

  return {
    ...definition.parameters,
    properties: {
      ...definition.parameters.properties,
      completeTurn: {
        type: 'boolean',
        description: COMPLETE_TURN_DESCRIPTION,
      },
    },
  };
}

/**
 * Where the acknowledgement is going, and therefore how it is written. The
 * channel decides the markup: web chat and Telegram render Markdown; WhatsApp
 * keeps the existing plain-text acknowledgement layout.
 */
export type TerminalResponseContext = {
  locale: SupportedLocale;
  timezone?: string;
  /** Channel that will receive the reply; undefined means the web UI. */
  channel?: MessageProvider;
};

/**
 * Acknowledgement for a completed step, or `null` when the step must continue
 * through the model.
 *
 * `executions` is every successful call of the turn so far, so work finished in
 * an earlier step is still confirmed. Only `decidedBy` — the calls of the step
 * that just finished — decides whether the turn may end: an earlier call that
 * correctly asked for a follow-up ("save the file, then send it") has already
 * been honoured by the later step and must not block its acknowledgement.
 *
 * The step qualifies only when it produced at least one execution, every call
 * that decided it is an eligible tool that did not opt out with
 * `completeTurn: false`, and every rendered result is recognised and safe to
 * describe. Anything else — an unknown tool, a malformed or unexpected result —
 * returns `null` rather than risk claiming success the tools did not confirm.
 */
export function buildTerminalToolResponse(
  context: TerminalResponseContext,
  executions: readonly TerminalToolExecution[],
  decidedBy: readonly TerminalToolExecution[] = executions,
): string | null {
  if (executions.length === 0 || decidedBy.length === 0) return null;

  for (const execution of decidedBy) {
    if (!TERMINAL_TOOL_NAMES.has(execution.toolName)) return null;
    if (requestsFollowUp(execution.arguments)) return null;
  }

  // Batch compact receipts by action at its first occurrence. Creations and
  // updates remain separate so the confirmation describes what happened.
  const groups: Array<{ toolName: string; results: unknown[] }> = [];
  const receiptGroups = new Map<string, unknown[]>();

  for (const execution of executions) {
    if (!TERMINAL_TOOL_NAMES.has(execution.toolName)) return null;

    if (isTaskTool(execution.toolName) || isReceiptTool(execution.toolName)) {
      const existing = receiptGroups.get(execution.toolName);

      if (existing) {
        existing.push(execution.result);
        continue;
      }

      const results = [execution.result];
      receiptGroups.set(execution.toolName, results);
      groups.push({ toolName: execution.toolName, results });
    } else {
      groups.push({
        toolName: execution.toolName,
        results: [execution.result],
      });
    }
  }

  const messages: string[] = [];

  for (const group of groups) {
    const name = group.toolName;
    const formatter: Formatter | undefined = isTaskTool(name)
      ? (context) => taskAck(context, name, group.results)
      : isReceiptTool(name)
        ? (context) => receiptAck(context, name, group.results)
        : FORMATTER_ENTRIES[name];

    if (!formatter) return null;

    const message = safeMessage(context, formatter, group.results[0]);
    if (!message) return null;

    messages.push(message);
  }

  return messages.join('\n\n');
}

/** A call that declared more work returns the turn to the model. */
function requestsFollowUp(argumentsValue: unknown): boolean {
  const record = asRecord(argumentsValue);

  return record?.completeTurn === false;
}

type Formatter = (
  context: TerminalResponseContext,
  result: unknown,
) => string | null;

/**
 * A formatter may only end the turn when it produced text; a throw is treated
 * as an unrecognised result so a broken formatter degrades to the normal model
 * reply instead of failing the run.
 */
function safeMessage(
  context: TerminalResponseContext,
  formatter: Formatter,
  result: unknown,
): string | null {
  try {
    const message = formatter(context, result);

    return typeof message === 'string' && message.trim()
      ? message.trim()
      : null;
  } catch (error) {
    // Degraded mode: hand the turn back to the model, but retain evidence that
    // a formatter failed. Do not log tool results or personal task content.
    Logger.warn(
      `Acknowledgement formatter failed (${error instanceof Error ? error.name : typeof error}); continuing with model response.`,
      'TerminalToolResponse',
    );

    return null;
  }
}

/** Names must stay short enough to read inside a block line. */
const MAX_NAME_CHARS = 160;

function pick(locale: SupportedLocale, en: string, id: string): string {
  return locale === 'id' ? id : en;
}

function priorityLabel(
  locale: SupportedLocale,
  priority: 'low' | 'medium' | 'high',
): string {
  if (locale === 'en')
    return { low: 'low', medium: 'medium', high: 'high' }[priority];

  return { low: 'rendah', medium: 'sedang', high: 'tinggi' }[priority];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asList(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

/** Collapses whitespace and control characters so user text cannot reflow. */
function asText(value: unknown, limit = MAX_NAME_CHARS): string | null {
  if (typeof value !== 'string') return null;

  const cleaned = value
    .replace(/[\p{Cc}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;

  return cleaned.length <= limit ? cleaned : `${cleaned.slice(0, limit)}…`;
}

function joined(values: readonly string[]): string {
  return values.join(', ');
}

/** Icon and heading of every block, in both locales. */
const HEADINGS: Readonly<
  Record<TerminalToolName, { icon: string; en: string; id: string }>
> = {
  create_task: { icon: '✅', en: 'Task created', id: 'Tugas dibuat' },
  update_task: { icon: '✏️', en: 'Task updated', id: 'Tugas diperbarui' },
  update_category: {
    icon: '✏️',
    en: 'Category updated',
    id: 'Kategori diperbarui',
  },
  delete_category: {
    icon: '🗑️',
    en: 'Category deleted',
    id: 'Kategori dihapus',
  },
  create_reminder: {
    icon: '⏰',
    en: 'Reminder created',
    id: 'Pengingat dibuat',
  },
  update_reminder: {
    icon: '⏰',
    en: 'Reminder updated',
    id: 'Pengingat diperbarui',
  },
  store_secret: { icon: '🔐', en: 'Secret stored', id: 'Rahasia disimpan' },
  delete_reminder: {
    icon: '🗑️',
    en: 'Reminder deleted',
    id: 'Pengingat dihapus',
  },
  create_contact_group: {
    icon: '🏷️',
    en: 'Contact group ready',
    id: 'Grup kontak tersedia',
  },
  create_secret_reveal_link: {
    icon: '🔗',
    en: 'Reveal link created',
    id: 'Tautan dibuat',
  },
  save_contact: { icon: '👤', en: 'Contact saved', id: 'Kontak disimpan' },
  update_contact_group: {
    icon: '🏷️',
    en: 'Contact group updated',
    id: 'Grup kontak diperbarui',
  },
  delete_contact_group: {
    icon: '🗑️',
    en: 'Contact group deleted',
    id: 'Grup kontak dihapus',
  },
  assign_contact_groups: {
    icon: '🏷️',
    en: 'Contact groups updated',
    id: 'Grup kontak diperbarui',
  },
  save_attached_files: { icon: '📎', en: 'Files saved', id: 'File disimpan' },
  send_file: { icon: '📤', en: 'File sent', id: 'File dikirim' },
  create_calendar_event: {
    icon: '📅',
    en: 'Event created',
    id: 'Acara dibuat',
  },
  update_calendar_event: {
    icon: '📅',
    en: 'Event updated',
    id: 'Acara diperbarui',
  },
  cancel_calendar_event: {
    icon: '📅',
    en: 'Event cancelled',
    id: 'Acara dibatalkan',
  },
  write_daily_note: {
    icon: '📝',
    en: 'Daily note written',
    id: 'Catatan harian ditulis',
  },
};

type BlockOptions = {
  heading?: string;
  /** Primary object of the block, verbatim; omitted when the tool has none. */
  subject?: string | null;
  details?: readonly string[];
  /** Item count, added to the heading when a tool returned several. */
  count?: number;
};

/**
 * Renders one block: the icon and heading, a blank line, then the subject and
 * its detail lines. The web chat gets markdown bold on the heading and subject
 * so the block scans as one object. Telegram uses the same Rich Markdown;
 * WhatsApp keeps the identical layout without markup. This legacy layout remains
 * for categories, secrets, and daily notes.
 */
function renderAcknowledgement(
  context: TerminalResponseContext,
  name: TerminalToolName,
  options: BlockOptions = {},
): string {
  const { icon, en, id } = HEADINGS[name];
  const count = options.count;
  const heading =
    options.heading ??
    (count !== undefined && count > 1
      ? pick(
          context.locale,
          `${en} (${count})`,
          `${count} ${id.toLocaleLowerCase('id-ID')}`,
        )
      : pick(context.locale, en, id));

  const rich = context.channel !== 'whatsapp';

  const body: string[] = [];

  if (options.subject)
    body.push(
      rich ? `**${escapeReceiptMarkdown(options.subject)}**` : options.subject,
    );
  if (options.details) body.push(...options.details);

  const head = `${icon} ${rich ? `**${heading}**` : heading}`;

  return body.length > 0 ? `${head}\n\n${body.join('\n')}` : head;
}

/** Reads the `object` of a `{ objectType, object }` result, or null. */
function wrappedObject(
  result: unknown,
  objectType: string,
): Record<string, unknown> | null {
  const record = asRecord(result);
  if (!record || record.objectType !== objectType) return null;

  return asRecord(record.object);
}

function instantOf(value: unknown): Date | null {
  if (value instanceof Date)
    return Number.isNaN(value.valueOf()) ? null : value;
  if (typeof value !== 'string') return null;

  const parsed = new Date(value);

  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

/** Wall clock in the given zone, falling back to UTC for an unknown zone. */
function zoneParts(
  instant: Date,
  timezone: unknown,
): { date: string; time: string } | null {
  const zone =
    typeof timezone === 'string' && timezone.trim() ? timezone.trim() : 'UTC';

  const at = (timeZone: string) => ({
    date: new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant),
    time: new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(instant),
  });

  try {
    return at(zone);
  } catch {
    try {
      return at('UTC');
    } catch {
      return null;
    }
  }
}

function zonedLabel(value: unknown, timezone: unknown): string | null {
  const instant = instantOf(value);
  if (!instant) return null;
  const parts = zoneParts(instant, timezone);

  return parts ? `${parts.date} ${parts.time}` : null;
}

/**
 * Stored instants without a zone travel as UTC. Labelling the zone keeps the
 * acknowledgement honest instead of implying the user's local clock.
 */
function utcLabel(value: unknown): string | null {
  const instant = instantOf(value);
  if (!instant) return null;
  const parts = zoneParts(instant, 'UTC');

  return parts ? `${parts.date} ${parts.time} UTC` : null;
}

/** Absolute http(s) link, or null when the result is not one. */
function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  const candidate = value.replace(/[\p{Cc}\s]/gu, '');

  try {
    const parsed = new URL(candidate);

    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

const WEEKDAY_NAMES: Record<SupportedLocale, readonly string[]> = {
  en: [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ],
  id: ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
};

const FREQUENCY_UNITS: Record<
  SupportedLocale,
  Record<'daily' | 'weekly' | 'monthly' | 'yearly', string>
> = {
  en: { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' },
  id: { daily: 'hari', weekly: 'minggu', monthly: 'bulan', yearly: 'tahun' },
};

const FREQUENCY_LABELS: Record<
  SupportedLocale,
  Record<'weekly' | 'monthly' | 'yearly', string>
> = {
  en: { weekly: 'weekly', monthly: 'monthly', yearly: 'yearly' },
  id: { weekly: 'mingguan', monthly: 'bulanan', yearly: 'tahunan' },
};

/**
 * Compact repeat phrase, e.g. `daily`, `every 2 weeks on Monday, Thursday`.
 * Returns null for a malformed rule so the caller can refuse the whole
 * acknowledgement; a null rule is "no repeat" and is handled before this call.
 */
function recurrencePhrase(
  locale: SupportedLocale,
  value: unknown,
): string | null {
  const rule = asRecord(value);
  if (!rule) return null;

  const frequency = rule.frequency;
  const interval = rule.interval;

  if (
    frequency !== 'daily' &&
    frequency !== 'weekly' &&
    frequency !== 'monthly' &&
    frequency !== 'yearly'
  )
    return null;
  if (
    typeof interval !== 'number' ||
    !Number.isInteger(interval) ||
    interval < 1
  )
    return null;

  const unit = FREQUENCY_UNITS[locale][frequency];
  const every =
    interval === 1
      ? null
      : pick(
          locale,
          `every ${interval} ${unit}s`,
          `setiap ${interval} ${unit}`,
        );

  if (frequency === 'daily') return every ?? pick(locale, 'daily', 'harian');

  if (frequency === 'weekly') {
    const weekdays = rule.daysOfWeek;

    if (weekdays === undefined || weekdays === null) {
      const label = FREQUENCY_LABELS[locale].weekly;

      return every
        ? pick(
            locale,
            `${every} on the same weekdays`,
            `${every} pada hari yang sama`,
          )
        : label;
    }

    const days = asList(weekdays);
    if (!days || days.length === 0) return null;

    const names: string[] = [];

    for (const day of days) {
      if (
        typeof day !== 'number' ||
        !Number.isInteger(day) ||
        day < 0 ||
        day > 6
      )
        return null;
      const name = WEEKDAY_NAMES[locale][day];
      if (!name) return null;
      names.push(name);
    }

    const label = FREQUENCY_LABELS[locale].weekly;

    return pick(
      locale,
      `${every ?? label} on ${joined(names)}`,
      `${every ?? label} pada ${joined(names)}`,
    );
  }

  const label = FREQUENCY_LABELS[locale][frequency];
  if (!every) return label;

  return pick(
    locale,
    `${every} starting on the same date`,
    `${every} pada tanggal yang sama`,
  );
}

/**
 * Names of a `{ name }[]` field — task categories, contact groups. A malformed
 * entry returns null so the caller refuses the whole acknowledgement.
 */
function namedValues(value: unknown): string[] | null {
  const items = asList(value);
  if (!items) return null;

  const names: string[] = [];

  for (const item of items) {
    const record = asRecord(item);
    const name = record ? asText(record.name) : null;
    if (!name) return null;
    names.push(name);
  }

  return names;
}

function taskAck(
  context: TerminalResponseContext,
  name: TaskToolName,
  results: readonly unknown[],
): string | null {
  const rich = context.channel !== 'whatsapp';
  const entries = new Map<string, string>();

  for (const result of results) {
    const object = wrappedObject(result, 'task');
    if (!object) return null;

    // Task titles can be up to 240 characters. Keep the full title so the web
    // renderer can match the saved entity instead of appending a second pill.
    const title = asText(object.title, 240);
    if (!title) return null;

    const details: string[] = [];

    if (object.dueAt !== null && object.dueAt !== undefined) {
      const instant = instantOf(object.dueAt);
      if (!instant) return null;

      const due = new Intl.DateTimeFormat(
        context.locale === 'id' ? 'id-ID' : 'en-GB',
        {
          timeZone: context.timezone ?? 'UTC',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        },
      ).format(instant);

      const labelled = context.timezone ? due : `${due} UTC`;
      details.push(
        pick(context.locale, `Due ${labelled}`, `Tenggat ${labelled}`),
      );
    }

    const priority = object.priority;

    if (priority !== null && priority !== undefined) {
      if (priority !== 'low' && priority !== 'medium' && priority !== 'high')
        return null;
      if (priority !== 'medium')
        details.push(
          `${pick(context.locale, 'Priority', 'Prioritas')} ${priorityLabel(context.locale, priority)}`,
        );
    }

    const categories =
      object.categories === null || object.categories === undefined
        ? []
        : namedValues(object.categories);

    if (!categories) return null;

    if (categories.length > 0) {
      const labels = joined(categories);
      details.push(
        `${pick(context.locale, 'Categories', 'Kategori')}: ${rich ? escapeReceiptMarkdown(labels) : labels}`,
      );
    }

    // Replayed results for one saved task count once; keep its newest snapshot.
    // Legacy results without IDs remain supported as distinct entries.
    const id = object.id === undefined ? null : asText(object.id);
    if (object.id !== undefined && !id) return null;
    const subject = rich ? `**${escapeReceiptMarkdown(title)}**` : title;
    const row =
      details.length > 0 ? `${subject} — ${details.join(' · ')}` : subject;

    entries.set(id ? `task:${id}` : `legacy:${entries.size}`, `- ${row}`);
  }

  if (entries.size === 0) return null;
  const verb =
    name === 'create_task'
      ? pick(context.locale, 'created', 'dibuat')
      : pick(context.locale, 'updated', 'diperbarui');

  const heading =
    entries.size === 1
      ? pick(
          context.locale,
          `All set, your task has been ${verb}.`,
          `Siap, tugasnya sudah ${verb}.`,
        )
      : pick(
          context.locale,
          `All set, ${entries.size} tasks have been ${verb}.`,
          `Siap, ${entries.size} tugas sudah ${verb}.`,
        );

  return `${heading}\n\n${[...entries.values()].join('\n')}`;
}

/** Escape user text before adding Markdown; entity pills match rendered text. */
function escapeReceiptMarkdown(value: string): string {
  return value.replace(/([\\`*_[\]<>!#|~$=^])/g, '\\$1');
}

type ReceiptItem = {
  subject: string;
  id?: string;
  details: string[];
  /** A legacy file without entity identity still needs an accessible URL. */
  url?: string;
};
type ReceiptDefinition = {
  noun: [en: string, enPlural: string, id: string];
  verb: [en: string, id: string];
  /** Group creation may reuse an existing group, so confirm availability. */
  available?: boolean;
  items: (
    context: TerminalResponseContext,
    result: unknown,
  ) => ReceiptItem[] | null;
};

const RECEIPTS = {
  delete_reminder: {
    noun: ['reminder', 'reminders', 'pengingat'],
    verb: ['deleted', 'dihapus'],
    items: deletedReminderItems,
  },
  create_contact_group: {
    noun: ['contact group', 'contact groups', 'grup kontak'],
    verb: ['ready', 'tersedia'],
    available: true,
    items: groupItems,
  },
  create_reminder: {
    noun: ['reminder', 'reminders', 'pengingat'],
    verb: ['created', 'dibuat'],
    items: reminderItems,
  },
  update_reminder: {
    noun: ['reminder', 'reminders', 'pengingat'],
    verb: ['updated', 'diperbarui'],
    items: updatedReminderItems,
  },
  save_contact: {
    noun: ['contact', 'contacts', 'kontak'],
    verb: ['saved', 'disimpan'],
    items: contactItems,
  },
  update_contact_group: {
    noun: ['contact group', 'contact groups', 'grup kontak'],
    verb: ['updated', 'diperbarui'],
    items: groupItems,
  },
  delete_contact_group: {
    noun: ['contact group', 'contact groups', 'grup kontak'],
    verb: ['deleted', 'dihapus'],
    items: deletedGroupItems,
  },
  assign_contact_groups: {
    noun: ['contact', 'contacts', 'kontak'],
    verb: ['updated', 'diperbarui'],
    items: assignedGroupItems,
  },
  save_attached_files: {
    noun: ['file', 'files', 'file'],
    verb: ['saved', 'disimpan'],
    items: savedFileItems,
  },
  send_file: {
    noun: ['file', 'files', 'file'],
    verb: ['sent', 'dikirim'],
    items: sentFileItems,
  },
  create_calendar_event: {
    noun: ['event', 'events', 'acara'],
    verb: ['created', 'dibuat'],
    items: eventItems,
  },
  update_calendar_event: {
    noun: ['event', 'events', 'acara'],
    verb: ['updated', 'diperbarui'],
    items: eventItems,
  },
  cancel_calendar_event: {
    noun: ['event', 'events', 'acara'],
    verb: ['cancelled', 'dibatalkan'],
    items: cancelledEventItems,
  },
} satisfies Record<string, ReceiptDefinition>;

type ReceiptToolName = keyof typeof RECEIPTS;

function isReceiptTool(name: string): name is ReceiptToolName {
  return Object.hasOwn(RECEIPTS, name);
}

/** Validates the whole batch before emitting a confirmation; latest IDs count once. */
function receiptAck(
  context: TerminalResponseContext,
  name: ReceiptToolName,
  results: readonly unknown[],
): string | null {
  const definition: ReceiptDefinition = RECEIPTS[name];
  const entries = new Map<string, ReceiptItem>();

  for (const result of results) {
    const items = definition.items(context, result);
    if (!items || items.length === 0) return null;
    for (const item of items)
      entries.set(
        item.id ? `entity:${item.id}` : `legacy:${entries.size}`,
        item,
      );
  }

  if (entries.size === 0) return null;
  const [en, plural, id] = definition.noun;
  const [enVerb, idVerb] = definition.verb;
  const heading =
    entries.size === 1
      ? pick(
          context.locale,
          definition.available
            ? `All set, your ${en} is ready.`
            : `All set, your ${en} has been ${enVerb}.`,
          `Siap, ${id}nya sudah ${idVerb}.`,
        )
      : pick(
          context.locale,
          definition.available
            ? `All set, ${entries.size} ${plural} are ready.`
            : `All set, ${entries.size} ${plural} have been ${enVerb}.`,
          `Siap, ${entries.size} ${id} sudah ${idVerb}.`,
        );

  const rich = context.channel !== 'whatsapp';
  const rows = [...entries.values()].map((item) => {
    const title = rich ? escapeReceiptMarkdown(item.subject) : item.subject;
    const subject = rich
      ? item.url
        ? `[${title}](${item.url.replace(/\(/g, '%28').replace(/\)/g, '%29')})`
        : `**${title}**`
      : title;

    const details = item.details.map((detail) =>
      rich ? escapeReceiptMarkdown(detail) : detail,
    );

    return `- ${subject}${details.length ? ` — ${details.join(' · ')}` : ''}`;
  });

  return `${heading}\n\n${rows.join('\n')}`;
}

/** Preserve full names so rendered titles still match existing entity pills. */
function receiptItem(
  object: Record<string, unknown>,
  field: string,
  idField = 'id',
): ReceiptItem | null {
  const subject = asText(object[field], Infinity);
  if (!subject) return null;
  const id =
    object[idField] === undefined ? undefined : asText(object[idField]);

  if (object[idField] !== undefined && !id) return null;

  return { subject, ...(id ? { id } : {}), details: [] };
}

function receiptDate(
  context: TerminalResponseContext,
  value: unknown,
  zone: string | undefined,
  time = true,
): string | null {
  const instant = instantOf(value);
  if (!instant) return null;
  const label = new Intl.DateTimeFormat(
    context.locale === 'id' ? 'id-ID' : 'en-GB',
    {
      timeZone: zone ?? 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(time
        ? ({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const)
        : {}),
    },
  ).format(instant);

  return zone ? label : `${label} UTC`;
}

function reminderItem(
  context: TerminalResponseContext,
  object: Record<string, unknown>,
): ReceiptItem | null {
  const item = receiptItem(object, 'title');
  const zone =
    context.timezone ??
    (typeof object.timezone === 'string' ? object.timezone : undefined);

  const at = receiptDate(context, object.scheduledAt, zone);
  if (!item || !at) return null;
  item.details.push(pick(context.locale, `At ${at}`, `Pada ${at}`));

  if (object.recurrence != null) {
    const repeat = recurrencePhrase(context.locale, object.recurrence);
    if (!repeat) return null;
    item.details.push(repeat);
    const rule = asRecord(object.recurrence)!;

    if (rule.endsAt != null) {
      const end = receiptDate(context, rule.endsAt, zone);
      if (!end) return null;
      item.details.push(pick(context.locale, `Until ${end}`, `Hingga ${end}`));
    }
  }

  return item;
}

function reminderItems(
  context: TerminalResponseContext,
  result: unknown,
): ReceiptItem[] | null {
  const record = asRecord(result);
  const reminders = record ? asList(record.reminders) : null;
  if (!reminders) return null;
  const items: ReceiptItem[] = [];

  for (const value of reminders) {
    const object = asRecord(value);
    const item = object ? reminderItem(context, object) : null;
    if (!item) return null;
    items.push(item);
  }

  return items;
}

function updatedReminderItems(
  context: TerminalResponseContext,
  result: unknown,
): ReceiptItem[] | null {
  const object = wrappedObject(result, 'reminder');
  const item = object ? reminderItem(context, object) : null;

  return item ? [item] : null;
}

function deletedReminderItems(
  _context: TerminalResponseContext,
  result: unknown,
): ReceiptItem[] | null {
  const object = asRecord(result);
  if (!object || object.deleted !== true) return null;
  const item = receiptItem(object, 'title', 'reminderId');
  if (!item?.id) return null;

  return [item];
}

function contactItems(
  context: TerminalResponseContext,
  result: unknown,
): ReceiptItem[] | null {
  const object = wrappedObject(result, 'contact');
  const item = object ? receiptItem(object, 'name') : null;
  if (!object || !item) return null;

  for (const field of ['email', 'phone']) {
    if (object[field] == null) continue;
    const value = asText(object[field]);
    if (!value) return null;
    item.details.push(value);
  }

  if (object.groups != null) {
    const groups = namedValues(object.groups);
    if (!groups) return null;
    if (groups.length)
      item.details.push(
        `${pick(context.locale, 'Groups', 'Grup')}: ${joined(groups)}`,
      );
  }

  return [item];
}

function groupItems(
  context: TerminalResponseContext,
  result: unknown,
): ReceiptItem[] | null {
  const object = wrappedObject(result, 'contact_group');
  const item = object ? receiptItem(object, 'name') : null;
  if (!object || !item) return null;

  if (object.contactCount != null) {
    const count = object.contactCount;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0)
      return null;
    item.details.push(
      pick(
        context.locale,
        `${count} ${count === 1 ? 'contact' : 'contacts'}`,
        `${count} kontak`,
      ),
    );
  }

  return [item];
}

function deletedGroupItems(
  _context: TerminalResponseContext,
  result: unknown,
): ReceiptItem[] | null {
  const object = wrappedObject(result, 'contact_group');
  const item = object ? receiptItem(object, 'name') : null;

  return item ? [item] : null;
}

function assignedGroupItems(
  context: TerminalResponseContext,
  result: unknown,
): ReceiptItem[] | null {
  const items = contactItems(context, result);
  const object = wrappedObject(result, 'contact');
  if (!items || !object) return null;
  const groups = namedValues(object.groups);
  if (!groups) return null;
  // Membership updates show the resulting groups, without unrelated contact data.
  items[0]!.details = [
    groups.length
      ? `${pick(context.locale, 'Groups', 'Grup')}: ${joined(groups)}`
      : pick(context.locale, 'No groups', 'Tanpa grup'),
  ];

  return items;
}

function fileDetails(
  context: TerminalResponseContext,
  object: Record<string, unknown>,
): string[] | null {
  const details: string[] = [];

  if (object.mimeType != null) {
    const mime = asText(object.mimeType);
    if (!mime) return null;
    const formats: Record<string, string> = {
      'application/pdf': 'PDF',
      'image/jpeg': 'JPEG',
      'image/png': 'PNG',
      'text/plain': 'TXT',
      'text/csv': 'CSV',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        'DOCX',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        'XLSX',
    };

    details.push(formats[mime] ?? mime);
  }

  if (object.size != null) {
    const size = object.size;
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 0)
      return null;
    const exponent =
      size < 1024
        ? 0
        : Math.min(3, Math.floor(Math.log(size) / Math.log(1024)));

    const value = new Intl.NumberFormat(
      context.locale === 'id' ? 'id-ID' : 'en-GB',
      { maximumFractionDigits: 1 },
    ).format(size / 1024 ** exponent);

    details.push(`${value} ${['B', 'KB', 'MB', 'GB'][exponent]}`);
  }

  if (object.status != null) {
    if (object.status === 'processing')
      details.push(pick(context.locale, 'Processing', 'Sedang diproses'));
    else if (object.status === 'failed')
      details.push(
        pick(context.locale, 'Processing failed', 'Pemrosesan gagal'),
      );
    else if (object.status !== 'ready') return null;
  }

  return details;
}

function savedFileItems(
  context: TerminalResponseContext,
  result: unknown,
): ReceiptItem[] | null {
  const record = asRecord(result);
  const objects =
    record?.objectType === 'documents' ? asList(record.objects) : null;

  if (!objects) return null;
  const items: ReceiptItem[] = [];

  for (const value of objects) {
    const object = asRecord(value);
    const item = object ? receiptItem(object, 'filename') : null;
    const details = object ? fileDetails(context, object) : null;
    if (!item || !details) return null;
    item.details = details;
    items.push(item);
  }

  return items;
}

function sentFileItems(
  context: TerminalResponseContext,
  result: unknown,
): ReceiptItem[] | null {
  const object = wrappedObject(result, 'file');
  const item = object ? receiptItem(object, 'filename', 'documentId') : null;
  if (!object || !item) return null;

  if (object.url == null) {
    if (object.providerMessageId == null) return null;
    item.details.push(
      pick(
        context.locale,
        'Sent as an attachment',
        'Terkirim sebagai lampiran',
      ),
    );
  } else {
    const url = httpUrl(object.url);
    if (!url) return null;
    // On web, an identified file already has a pill with download access.
    if (context.channel !== undefined) item.details.push(url);
    else if (!item.id) item.url = url;
  }

  return [item];
}

function eventItems(
  context: TerminalResponseContext,
  result: unknown,
): ReceiptItem[] | null {
  const object = wrappedObject(result, 'calendar_event');
  const item = object ? receiptItem(object, 'title') : null;
  if (!object || !item) return null;
  const zone =
    context.timezone ??
    (typeof object.timezone === 'string' ? object.timezone : undefined);

  const from = instantOf(object.startAt);
  const to = instantOf(object.endAt);
  if (!from || !to || to <= from) return null;
  const start = receiptDate(context, from, zone);
  const end = receiptDate(context, to, zone);
  if (!start || !end) return null;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: zone ?? 'UTC' });
  const clock = new Intl.DateTimeFormat(
    context.locale === 'id' ? 'id-ID' : 'en-GB',
    {
      timeZone: zone ?? 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    },
  );

  const sameDay = day.format(from) === day.format(to);
  const range = sameDay
    ? `${start.replace(/ UTC$/, '')}–${clock.format(to)}${zone ? '' : ' UTC'}`
    : `${start}–${end}`;

  item.details.push(range);

  if (object.location != null) {
    const location = asText(object.location);
    if (!location) return null;
    item.details.push(location);
  }

  return [item];
}

function cancelledEventItems(
  context: TerminalResponseContext,
  result: unknown,
): ReceiptItem[] | null {
  const object = wrappedObject(result, 'calendar_event');
  if (!object || object.status !== 'cancelled') return null;
  // Legacy cancellation results can contain only identity and confirmed status.
  if (object.startAt != null || object.endAt != null)
    return eventItems(context, result);
  const item = receiptItem(object, 'title');

  return item ? [item] : null;
}

function categoryAck(
  context: TerminalResponseContext,
  name: 'update_category' | 'delete_category',
  result: unknown,
): string | null {
  const object = wrappedObject(result, 'category');
  if (!object) return null;

  const label = asText(object.name);
  if (!label) return null;

  return renderAcknowledgement(context, name, { subject: label });
}

function revealLinkAck(
  context: TerminalResponseContext,
  result: unknown,
): string | null {
  const object = wrappedObject(result, 'secret_reveal');
  if (!object) return null;

  const label = asText(object.label);
  const url = httpUrl(object.url);
  if (!label || !url) return null;

  const details = [`🔗 ${url}`];

  if (object.expiresAt !== null && object.expiresAt !== undefined) {
    const expires = context.timezone
      ? zonedLabel(object.expiresAt, context.timezone)
      : utcLabel(object.expiresAt);

    if (!expires) return null;

    details.push(`🗓️ ${expires}`);
  }

  return renderAcknowledgement(context, 'create_secret_reveal_link', {
    subject: label,
    details,
  });
}

function writeDailyNoteAck(
  context: TerminalResponseContext,
  result: unknown,
): string | null {
  const record = asRecord(result);
  if (!record) return null;

  const date = asText(record.date, 10);
  const written = asText(record.written);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/u.test(date) || !written) return null;

  return renderAcknowledgement(context, 'write_daily_note', { subject: date });
}

const FORMATTER_ENTRIES: Readonly<Record<string, Formatter>> = {
  delete_reminder: (context, result) =>
    receiptAck(context, 'delete_reminder', [result]),
  create_contact_group: (context, result) =>
    receiptAck(context, 'create_contact_group', [result]),
  create_task: (context, result) => taskAck(context, 'create_task', [result]),
  update_task: (context, result) => taskAck(context, 'update_task', [result]),
  update_category: (context, result) =>
    categoryAck(context, 'update_category', result),
  delete_category: (context, result) =>
    categoryAck(context, 'delete_category', result),
  create_reminder: (context, result) =>
    receiptAck(context, 'create_reminder', [result]),
  update_reminder: (context, result) =>
    receiptAck(context, 'update_reminder', [result]),
  store_secret: (context, result) => {
    const object = wrappedObject(result, 'secret');
    const label = object ? asText(object.label) : null;

    return label
      ? renderAcknowledgement(context, 'store_secret', { subject: label })
      : null;
  },
  create_secret_reveal_link: revealLinkAck,
  save_contact: (context, result) =>
    receiptAck(context, 'save_contact', [result]),
  update_contact_group: (context, result) =>
    receiptAck(context, 'update_contact_group', [result]),
  delete_contact_group: (context, result) =>
    receiptAck(context, 'delete_contact_group', [result]),
  assign_contact_groups: (context, result) =>
    receiptAck(context, 'assign_contact_groups', [result]),
  save_attached_files: (context, result) =>
    receiptAck(context, 'save_attached_files', [result]),
  send_file: (context, result) => receiptAck(context, 'send_file', [result]),
  create_calendar_event: (context, result) =>
    receiptAck(context, 'create_calendar_event', [result]),
  update_calendar_event: (context, result) =>
    receiptAck(context, 'update_calendar_event', [result]),
  cancel_calendar_event: (context, result) =>
    receiptAck(context, 'cancel_calendar_event', [result]),
  write_daily_note: writeDailyNoteAck,
} satisfies Record<TerminalToolName, Formatter>;
