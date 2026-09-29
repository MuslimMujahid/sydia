import type { JSONSchema7 } from 'ai';
import type { SupportedLocale } from '../../../database/entities';
import type { MessageProvider } from '../../../shared/messaging';
import type { AssistantToolDefinition } from './tool-executor.service';

/**
 * Tools whose successful result fully answers the user's request, so the turn
 * can end with a deterministic acknowledgement instead of a second model call.
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
  'save_memory',
  'update_memory',
  'forget_memory',
  'store_secret',
  'create_secret_reveal_link',
  'save_contact',
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

/**
 * Tools the web chat already answers with a structured action card showing the
 * title, status, due date or scheduled time, recurrence and action buttons. On
 * that surface a full block would only repeat the card, so it collapses to its
 * heading. Channels have no card, so they always get the whole block.
 */
const CARD_BACKED_TOOL_NAMES: Readonly<Record<string, true>> = {
  create_task: true,
  update_task: true,
  create_reminder: true,
  update_reminder: true,
};

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
  'Set to false only when another tool call must still run after this one, because this call alone cannot finish the user request — a reminder split (update a recurring reminder, then create the remaining schedules, or vice versa) or a save/process/send chain (save files, then send one, or save a file, then read it). Leave it unset otherwise: a short confirmation is generated for you from the result, so do not set false merely to add commentary, restate the result, or offer follow-up suggestions. Several independent calls that together finish the request all keep the default.';

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
 * channel decides the markup: the web chat renders markdown, while WhatsApp and
 * Telegram send raw text with no `parse_mode`, so `**` there would reach the
 * user as literal asterisks.
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

  const messages: string[] = [];

  for (const execution of executions) {
    if (!TERMINAL_TOOL_NAMES.has(execution.toolName)) return null;

    const formatter = FORMATTER_ENTRIES[execution.toolName];
    if (!formatter) return null;

    const message = safeMessage(context, formatter, execution.result);
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
  } catch {
    return null;
  }
}

/** Names must stay short enough to read inside a block line. */
const MAX_NAME_CHARS = 160;
const MAX_CONTENT_CHARS = 120;

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
  save_memory: { icon: '🧠', en: 'Memory saved', id: 'Memori disimpan' },
  update_memory: { icon: '🧠', en: 'Memory updated', id: 'Memori diperbarui' },
  forget_memory: { icon: '🗑️', en: 'Memory forgotten', id: 'Memori dihapus' },
  store_secret: { icon: '🔐', en: 'Secret stored', id: 'Rahasia disimpan' },
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
  /** Primary object of the block, verbatim; omitted when the tool has none. */
  subject?: string | null;
  details?: readonly string[];
  /** Item count, added to the heading when a tool returned several. */
  count?: number;
};

/**
 * Renders one block: the icon and heading, a blank line, then the subject and
 * its detail lines. The web chat gets markdown bold on the heading and subject
 * so the block scans as one object; channels get the identical layout without
 * markup, because they render the text literally. A card-backed tool on the web
 * collapses to the bare heading, since the card beside it already carries the
 * detail.
 */
function renderAcknowledgement(
  context: TerminalResponseContext,
  name: TerminalToolName,
  options: BlockOptions = {},
): string {
  const { icon, en, id } = HEADINGS[name];
  const count = options.count;
  const heading =
    count !== undefined && count > 1
      ? pick(
          context.locale,
          `${en} (${count})`,
          `${count} ${id.toLocaleLowerCase('id-ID')}`,
        )
      : pick(context.locale, en, id);

  const rich = context.channel === undefined;

  if (rich && CARD_BACKED_TOOL_NAMES[name]) return `${icon} ${heading}`;

  const body: string[] = [];

  if (options.subject)
    body.push(rich ? `**${options.subject}**` : options.subject);
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

function rangeLabel(
  start: unknown,
  end: unknown,
  timezone: unknown,
): string | null {
  const from = instantOf(start);
  const to = instantOf(end);
  if (!from || !to) return null;
  const first = zoneParts(from, timezone);
  const last = zoneParts(to, timezone);
  if (!first || !last) return null;

  return first.date === last.date
    ? `${first.date} ${first.time}–${last.time}`
    : `${first.date} ${first.time}–${last.date} ${last.time}`;
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

/** `2026-09-22 17:00 (daily)`, with the repeat only when there is one. */
function reminderTime(
  locale: SupportedLocale,
  reminder: Record<string, unknown>,
): string | null {
  const at = zonedLabel(reminder.scheduledAt, reminder.timezone);
  if (!at) return null;

  if (reminder.recurrence === null || reminder.recurrence === undefined)
    return at;

  const repeat = recurrencePhrase(locale, reminder.recurrence);

  return repeat ? `${at} (${repeat})` : null;
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
  name: 'create_task' | 'update_task',
  result: unknown,
): string | null {
  const object = wrappedObject(result, 'task');
  if (!object) return null;

  const title = asText(object.title);
  if (!title) return null;

  const details: string[] = [];

  if (object.dueAt !== null && object.dueAt !== undefined) {
    const due = context.timezone
      ? zonedLabel(object.dueAt, context.timezone)
      : utcLabel(object.dueAt);

    if (!due) return null;

    details.push(`🗓️ ${pick(context.locale, `Due ${due}`, `Tenggat ${due}`)}`);
  }

  const priority = object.priority;

  if (priority !== null && priority !== undefined) {
    if (priority !== 'low' && priority !== 'medium' && priority !== 'high')
      return null;
    if (priority !== 'medium')
      details.push(
        `⚡ ${pick(context.locale, 'Priority', 'Prioritas')} ${priorityLabel(context.locale, priority)}`,
      );
  }

  const categories =
    object.categories === null || object.categories === undefined
      ? []
      : namedValues(object.categories);

  if (!categories) return null;
  if (categories.length > 0) details.push(`🏷️ ${joined(categories)}`);

  return renderAcknowledgement(context, name, { subject: title, details });
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

function createReminderAck(
  context: TerminalResponseContext,
  result: unknown,
): string | null {
  const record = asRecord(result);
  const reminders = record ? asList(record.reminders) : null;
  if (!reminders || reminders.length === 0) return null;

  const entries: Array<{ title: string; time: string }> = [];

  for (const item of reminders) {
    const reminder = asRecord(item);
    const title = reminder ? asText(reminder.title) : null;
    const time = reminder ? reminderTime(context.locale, reminder) : null;
    if (!title || !time) return null;

    entries.push({ title, time });
  }

  if (entries.length === 1) {
    const only = entries[0]!;

    return renderAcknowledgement(context, 'create_reminder', {
      subject: only.title,
      details: [`🗓️ ${only.time}`],
    });
  }

  return renderAcknowledgement(context, 'create_reminder', {
    count: entries.length,
    details: entries.map((entry) => `⏰ ${entry.title} · ${entry.time}`),
  });
}

function updateReminderAck(
  context: TerminalResponseContext,
  result: unknown,
): string | null {
  const object = wrappedObject(result, 'reminder');
  if (!object) return null;

  const title = asText(object.title);
  const time = reminderTime(context.locale, object);
  if (!title || !time) return null;

  return renderAcknowledgement(context, 'update_reminder', {
    subject: title,
    details: [`🗓️ ${time}`],
  });
}

function memoryAck(
  context: TerminalResponseContext,
  name: 'save_memory' | 'update_memory',
  result: unknown,
): string | null {
  const record = asRecord(result);
  const memory = record ? asRecord(record.memory) : null;
  if (!memory) return null;

  const content = asText(memory.content, MAX_CONTENT_CHARS);
  if (!content) return null;

  const category =
    memory.category === null || memory.category === undefined
      ? null
      : asText(memory.category);

  if (memory.category != null && !category) return null;

  return renderAcknowledgement(context, name, {
    subject: content,
    details: category ? [`🏷️ ${category}`] : [],
  });
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

function contactAck(
  context: TerminalResponseContext,
  result: unknown,
): string | null {
  const object = wrappedObject(result, 'contact');
  if (!object) return null;

  const name = asText(object.name);
  if (!name) return null;

  const details: string[] = [];
  const email =
    object.email === null || object.email === undefined
      ? null
      : asText(object.email);

  const phone =
    object.phone === null || object.phone === undefined
      ? null
      : asText(object.phone);

  if (object.email != null && !email) return null;
  if (object.phone != null && !phone) return null;
  if (email) details.push(`📧 ${email}`);
  if (phone) details.push(`📞 ${phone}`);

  const groups =
    object.groups === null || object.groups === undefined
      ? []
      : namedValues(object.groups);

  if (!groups) return null;
  if (groups.length > 0) details.push(`👥 ${joined(groups)}`);

  return renderAcknowledgement(context, 'save_contact', {
    subject: name,
    details,
  });
}

function contactGroupAck(
  context: TerminalResponseContext,
  name: 'update_contact_group' | 'delete_contact_group',
  result: unknown,
): string | null {
  const object = wrappedObject(result, 'contact_group');
  if (!object) return null;

  const label = asText(object.name);
  if (!label) return null;

  return renderAcknowledgement(context, name, { subject: label });
}

function assignGroupsAck(
  context: TerminalResponseContext,
  result: unknown,
): string | null {
  const object = wrappedObject(result, 'contact');
  if (!object) return null;

  const name = asText(object.name);
  if (!name) return null;

  const groups = namedValues(object.groups);
  if (!groups) return null;

  return renderAcknowledgement(context, 'assign_contact_groups', {
    subject: name,
    details: [
      groups.length === 0
        ? `👥 ${pick(context.locale, 'No groups', 'Tanpa grup')}`
        : `👥 ${joined(groups)}`,
    ],
  });
}

function documentNames(result: unknown): string[] | null {
  const record = asRecord(result);
  const objects = record ? asList(record.objects) : null;
  if (!objects || objects.length === 0) return null;

  const names: string[] = [];

  for (const item of objects) {
    const document = asRecord(item);
    const filename = document ? asText(document.filename) : null;
    if (!filename) return null;
    names.push(filename);
  }

  return names;
}

function saveAttachedFilesAck(
  context: TerminalResponseContext,
  result: unknown,
): string | null {
  const record = asRecord(result);
  if (!record || record.objectType !== 'documents') return null;

  const names = documentNames(result);
  if (!names) return null;

  if (names.length === 1)
    return renderAcknowledgement(context, 'save_attached_files', {
      subject: names[0]!,
    });

  return renderAcknowledgement(context, 'save_attached_files', {
    count: names.length,
    details: names.map((name) => `📄 ${name}`),
  });
}

function sendFileAck(
  context: TerminalResponseContext,
  result: unknown,
): string | null {
  const object = wrappedObject(result, 'file');
  if (!object) return null;

  const filename = asText(object.filename);
  if (!filename) return null;

  // A channel send returns the provider's message id and no url; the web result
  // carries the link instead. The shape decides the branch, so a result can
  // never claim a link it does not have.
  if (object.url === undefined || object.url === null) {
    if (
      object.providerMessageId === undefined ||
      object.providerMessageId === null
    )
      return null;

    return renderAcknowledgement(context, 'send_file', {
      subject: filename,
      details: [
        `📌 ${pick(context.locale, 'Sent as an attachment', 'Terkirim sebagai lampiran')}`,
      ],
    });
  }

  const url = httpUrl(object.url);
  if (!url) return null;

  // Only the web chat renders markdown, so a channel gets the bare url rather
  // than a link whose brackets would show up literally in the message.
  if (context.channel !== undefined)
    return renderAcknowledgement(context, 'send_file', {
      subject: filename,
      details: [`🔗 ${url}`],
    });

  // Markdown link text must not close its own brackets.
  const linkText = filename
    .replace(/[[\]()]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!linkText) return null;

  return renderAcknowledgement(context, 'send_file', {
    subject: filename,
    details: [`🔗 [${linkText}](${url})`],
  });
}

function calendarEventAck(
  context: TerminalResponseContext,
  name: 'create_calendar_event' | 'update_calendar_event',
  result: unknown,
): string | null {
  const object = wrappedObject(result, 'calendar_event');
  if (!object) return null;

  const title = asText(object.title);
  const range = rangeLabel(object.startAt, object.endAt, object.timezone);
  if (!title || !range) return null;

  const details = [`🗓️ ${range}`];
  const location =
    object.location === null || object.location === undefined
      ? null
      : asText(object.location);

  if (object.location != null && !location) return null;
  if (location) details.push(`📍 ${location}`);

  return renderAcknowledgement(context, name, { subject: title, details });
}

function cancelCalendarEventAck(
  context: TerminalResponseContext,
  result: unknown,
): string | null {
  const object = wrappedObject(result, 'calendar_event');
  if (!object || object.status !== 'cancelled') return null;

  const title = asText(object.title);
  if (!title) return null;

  return renderAcknowledgement(context, 'cancel_calendar_event', {
    subject: title,
    details: [`📌 ${pick(context.locale, 'Cancelled', 'Dibatalkan')}`],
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
  create_task: (context, result) => taskAck(context, 'create_task', result),
  update_task: (context, result) => taskAck(context, 'update_task', result),
  update_category: (context, result) =>
    categoryAck(context, 'update_category', result),
  delete_category: (context, result) =>
    categoryAck(context, 'delete_category', result),
  create_reminder: createReminderAck,
  update_reminder: updateReminderAck,
  save_memory: (context, result) => memoryAck(context, 'save_memory', result),
  update_memory: (context, result) =>
    memoryAck(context, 'update_memory', result),
  forget_memory: (context, result) => {
    const record = asRecord(result);
    if (!record || record.deleted !== true) return null;

    return renderAcknowledgement(context, 'forget_memory');
  },
  store_secret: (context, result) => {
    const object = wrappedObject(result, 'secret');
    const label = object ? asText(object.label) : null;

    return label
      ? renderAcknowledgement(context, 'store_secret', { subject: label })
      : null;
  },
  create_secret_reveal_link: revealLinkAck,
  save_contact: contactAck,
  update_contact_group: (context, result) =>
    contactGroupAck(context, 'update_contact_group', result),
  delete_contact_group: (context, result) =>
    contactGroupAck(context, 'delete_contact_group', result),
  assign_contact_groups: assignGroupsAck,
  save_attached_files: saveAttachedFilesAck,
  send_file: sendFileAck,
  create_calendar_event: (context, result) =>
    calendarEventAck(context, 'create_calendar_event', result),
  update_calendar_event: (context, result) =>
    calendarEventAck(context, 'update_calendar_event', result),
  cancel_calendar_event: cancelCalendarEventAck,
  write_daily_note: writeDailyNoteAck,
} satisfies Record<TerminalToolName, Formatter>;
