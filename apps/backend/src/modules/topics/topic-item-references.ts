import type {
  TopicItemRef,
  TopicItemType,
  TopicSourceInvocation,
  TopicSourceMessage,
} from '../../database/entities';

const MAX_ID_LENGTH = 200;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function id(value: unknown): string | null {
  return typeof value === 'string' &&
    value.trim() &&
    value.length <= MAX_ID_LENGTH
    ? value
    : null;
}

/** `{ objectType, object: { id } }`, the shape of most single-item results. */
function wrapped(result: unknown, objectType: string): string[] {
  const value = record(result);
  if (value?.objectType !== objectType) return [];
  const found = id(record(value.object)?.id);

  return found ? [found] : [];
}

function listed(result: unknown, field: string): string[] {
  const list = record(result)?.[field];

  return Array.isArray(list)
    ? list.flatMap((entry) => {
        const found = id(record(entry)?.id);

        return found ? [found] : [];
      })
    : [];
}

function argument(invocation: TopicSourceInvocation, field: string) {
  return id(record(invocation.arguments)?.[field]);
}

function customNote(noteId: string | null): string[] {
  return noteId ? [`custom:${noteId}`] : [];
}

function dailyNote(date: unknown): string[] {
  return typeof date === 'string' && DAY_KEY.test(date)
    ? [`daily:${date}`]
    : [];
}

type Extractor = {
  type: TopicItemType;
  ids(invocation: TopicSourceInvocation): string[];
};

/**
 * Tools whose completed call identifies an item the user worked on. Deletions,
 * listings and searches are absent: they do not show which item the turn was
 * about. Secrets are never linked (TOPIC-PRIV-04).
 */
const EXTRACTORS: Readonly<Record<string, Extractor>> = {
  create_task: { type: 'task', ids: (i) => wrapped(i.result, 'task') },
  update_task: { type: 'task', ids: (i) => wrapped(i.result, 'task') },
  create_reminder: {
    type: 'reminder',
    ids: (i) => listed(i.result, 'reminders'),
  },
  update_reminder: {
    type: 'reminder',
    ids: (i) => wrapped(i.result, 'reminder'),
  },
  create_calendar_event: {
    type: 'calendar_event',
    ids: (i) => wrapped(i.result, 'calendar_event'),
  },
  update_calendar_event: {
    type: 'calendar_event',
    ids: (i) => wrapped(i.result, 'calendar_event'),
  },
  save_contact: { type: 'contact', ids: (i) => wrapped(i.result, 'contact') },
  save_attached_files: {
    type: 'document',
    ids: (i) =>
      record(i.result)?.objectType === 'documents'
        ? listed(i.result, 'objects')
        : [],
  },
  read_document: {
    type: 'document',
    ids: (i) => {
      const found = argument(i, 'documentId');

      return found ? [found] : [];
    },
  },
  read_custom_note: {
    type: 'note',
    ids: (i) => customNote(argument(i, 'id')),
  },
  create_custom_note: {
    type: 'note',
    ids: (i) => {
      const result = record(i.result);

      return result?.kind === 'note' ? customNote(id(result.id)) : [];
    },
  },
  update_custom_note: {
    type: 'note',
    ids: (i) => customNote(argument(i, 'id')),
  },
  // The date defaults to today, so it is taken from the result; an empty day
  // is not an item.
  read_daily_note: {
    type: 'note',
    ids: (i) => {
      const result = record(i.result);

      return result?.found === true ? dailyNote(result.date) : [];
    },
  },
  write_daily_note: {
    type: 'note',
    ids: (i) => dailyNote(record(i.result)?.date),
  },
  // Record notes are custom notes in the record format, addressed by `id`.
  read_record_note_content: {
    type: 'note',
    ids: (i) => customNote(argument(i, 'id')),
  },
  add_record_rows: {
    type: 'note',
    ids: (i) => customNote(argument(i, 'id')),
  },
  update_record_rows: {
    type: 'note',
    ids: (i) => customNote(argument(i, 'id')),
  },
  change_record_schema: {
    type: 'note',
    ids: (i) => customNote(argument(i, 'id')),
  },
};

/** Items a completed tool call created, changed or read for the user. */
export function touchedItems(
  invocation: TopicSourceInvocation,
): TopicItemRef[] {
  const extractor = EXTRACTORS[invocation.name];

  return extractor
    ? extractor.ids(invocation).map((itemId) => ({
        type: extractor.type,
        id: itemId,
      }))
    : [];
}

const TITLE_FIELDS = ['title', 'name', 'filename'] as const;

function titleOf(value: Record<string, unknown>): string | null {
  for (const field of TITLE_FIELDS)
    if (typeof value[field] === 'string' && value[field].trim())
      return value[field].trim().slice(0, 120);

  return null;
}

/**
 * Best-effort title of an item a tool call touched, so the formation model can
 * tell what it is: the result object carrying that id, or the call's title.
 */
export function touchedItemTitle(
  invocation: TopicSourceInvocation,
  itemId: string,
): string | null {
  const bareId = itemId.replace(/^(custom|daily):/, '');
  const queue: Array<{ value: unknown; depth: number }> = [
    { value: invocation.result, depth: 0 },
  ];

  while (queue.length) {
    const { value, depth } = queue.shift()!;

    if (Array.isArray(value)) {
      if (depth < 3)
        value.forEach((entry) =>
          queue.push({ value: entry, depth: depth + 1 }),
        );
      continue;
    }

    const object = record(value);
    if (!object) continue;
    if (object.id === bareId && titleOf(object)) return titleOf(object);
    if (depth < 3)
      Object.values(object).forEach((entry) =>
        queue.push({ value: entry, depth: depth + 1 }),
      );
  }

  const args = record(invocation.arguments);

  return args ? titleOf(args) : null;
}

/** Items a message had open or selected as sources (explicit anchors). */
export function messageAnchors(message: TopicSourceMessage): TopicItemRef[] {
  return [
    ...(message.activeNoteRef ? [message.activeNoteRef] : []),
    ...message.sourceNoteRefs,
  ]
    .map((ref): TopicItemRef => ({ type: 'note', id: ref }))
    .concat(
      message.sourceDocumentIds.map((documentId) => ({
        type: 'document' as const,
        id: documentId,
      })),
    );
}

/** Deduplicates refs, keeping first-seen order. */
export function uniqueItems(items: readonly TopicItemRef[]): TopicItemRef[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);

    return true;
  });
}
