import type { JSONSchema7 } from 'ai';
import type { Prisma } from '../../../generated/prisma/client';
import type { CalendarEventWrite, Document } from '../../../database/entities';
import type {
  ICalendarRepository,
  IContactRepository,
  IUserRepository,
} from '../../../database/interfaces';
import { CalendarService } from '../../calendar/calendar.service';
import { DocumentService } from '../../documents/document.service';
import type { AssistantTool } from './tool-executor.service';

const LIST_DOCUMENTS_LIMIT = 25;
const READ_DOCUMENT_DEFAULT_LIMIT = 4;
const READ_DOCUMENT_MAX_LIMIT = 10;
const READ_DOCUMENT_CHUNK_CHARS = 800;
const SEARCH_QUOTE_CHARS = 600;

/** Keeps model-visible tool results bounded; full data stays in the database. */
function bounded(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}…`;
}

function documentSummary(document: Document) {
  return {
    id: document.id,
    filename: document.file.originalName,
    mimeType: document.file.mimeType,
    size: document.file.size,
    status: document.status,
  };
}

const string = { type: 'string' } as const;
const schema = (
  properties: NonNullable<JSONSchema7['properties']>,
  required: string[] = [],
): JSONSchema7 => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid tool arguments.');

  return value as Record<string, unknown>;
}

function text(
  value: Record<string, unknown>,
  key: string,
  required = true,
): string | undefined {
  const found = value[key];
  if (found === undefined && !required) return undefined;
  if (typeof found !== 'string' || !found.trim())
    throw new Error(`${key} must be text.`);

  return found.trim();
}

function integer(
  value: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const found = value[key] ?? fallback;
  if (typeof found !== 'number' || !Number.isInteger(found))
    throw new Error(`${key} must be an integer.`);

  return found;
}

function date(
  value: Record<string, unknown>,
  key: string,
  required = true,
): Date | undefined {
  const raw = text(value, key, required);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf()))
    throw new Error(`${key} must be an ISO datetime.`);

  return parsed;
}

export function createPhaseTools(deps: {
  contacts: IContactRepository;
  documents: DocumentService;
  calendars: ICalendarRepository;
  calendarService: CalendarService;
  users: IUserRepository;
}): AssistantTool[] {
  const parseArguments = (value: unknown): Prisma.InputJsonValue =>
    record(value) as Prisma.InputJsonValue;

  return [
    {
      definition: {
        name: 'save_contact',
        label: 'Save contact',
        description: `Use this tool to create a contact record from a required name and optional aliases, email, phone, and notes.

Use it when the user asks to save, add, or remember a person's contact details.

Do not use it to find an existing contact or when nothing should be persisted.

The contact is created for the current user; aliases must be strings and omitted optional fields are stored as null.`,
        parameters: schema(
          {
            name: { ...string, description: 'Required contact display name.' },
            aliases: {
              type: 'array',
              description: 'Optional alternate names for the contact.',
              items: { ...string, description: 'An alternate contact name.' },
            },
            email: {
              ...string,
              description: 'Optional email address for the contact.',
            },
            phone: {
              ...string,
              description: 'Optional phone number for the contact.',
            },
            notes: {
              ...string,
              description: 'Optional free-form notes about the contact.',
            },
          },
          ['name'],
        ),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const a = record(raw);

        return {
          objectType: 'contact',
          object: await deps.contacts.create(userId, {
            name: text(a, 'name')!,
            aliases: Array.isArray(a.aliases)
              ? a.aliases.filter((v): v is string => typeof v === 'string')
              : [],
            email: text(a, 'email', false) ?? null,
            phone: text(a, 'phone', false) ?? null,
            notes: text(a, 'notes', false) ?? null,
          }),
        };
      },
    },
    {
      definition: {
        name: 'resolve_contact',
        label: 'Find contact',
        description: `Use this tool to find contacts matching a reference.

Use it when the user asks to look up an existing contact by name, alias, email, or phone.

Do not use it to create or modify contact details.

Matches the current user's contacts by name, alias, email, or phone; it does not change them.`,
        parameters: schema(
          {
            reference: {
              ...string,
              description:
                'Name, alias, email address, or phone number to match.',
            },
          },
          ['reference'],
        ),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw }) => ({
        contacts: await deps.contacts.resolve(
          userId,
          text(record(raw), 'reference')!,
        ),
      }),
    },
    {
      definition: {
        name: 'list_documents',
        label: 'List files',
        description: `Use this tool to list the current user's saved document metadata.

Use it when the user asks what files or documents are available.

Do not use it when contents, semantic search, or the active message's attachments are needed.

Returns each document's id, filename, MIME type, size, status, and creation time, capped at 25 documents; this tool takes no parameters.`,
        parameters: schema({}),
      },
      parseArguments,
      execute: async ({ userId }) => {
        const documents = await deps.documents.listMetadata(userId);
        const listed = documents
          .slice(0, LIST_DOCUMENTS_LIMIT)
          .map((document) => ({
            id: document.id,
            filename: document.file.originalName,
            mimeType: document.file.mimeType,
            size: document.file.size,
            status: document.status,
            createdAt: document.createdAt,
          }));

        return documents.length > LIST_DOCUMENTS_LIMIT
          ? { documents: listed, total: documents.length }
          : { documents: listed };
      },
    },
    {
      definition: {
        name: 'read_document',
        label: 'Read document',
        description: `Use this tool to read content chunks from one saved document.

Use it when you need the contents of a specific document and have its id.

Do not use it for a file list, semantic search, or when no document is identified.

documentId is required; cursor defaults to 0 and limit defaults to 4 (1 through 10). Each chunk's content is truncated to keep the result bounded; the result includes metadata, chunks with page positions, nextCursor, and hasMore.`,
        parameters: schema(
          {
            documentId: {
              ...string,
              description: 'Required identifier of the document to read.',
            },
            cursor: {
              type: 'integer',
              minimum: 0,
              description: 'Optional non-negative chunk offset; defaults to 0.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: READ_DOCUMENT_MAX_LIMIT,
              description:
                'Optional number of chunks to return, from 1 through 10; defaults to 4.',
            },
          },
          ['documentId'],
        ),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const a = record(raw);
        const cursor = integer(a, 'cursor', 0);
        const limit = integer(a, 'limit', READ_DOCUMENT_DEFAULT_LIMIT);
        if (cursor < 0 || limit < 1 || limit > READ_DOCUMENT_MAX_LIMIT)
          throw new Error('Invalid document read range.');

        const result = await deps.documents.read(
          userId,
          text(a, 'documentId')!,
          cursor,
          limit,
        );

        if (!result) throw new Error('Document not found.');

        return {
          documentId: result.document.id,
          filename: result.document.file.originalName,
          status: result.document.status,
          chunks: result.chunks.map((chunk) => ({
            chunk: chunk.chunkIndex,
            page: chunk.pageNumber,
            content: bounded(chunk.content, READ_DOCUMENT_CHUNK_CHARS),
          })),
          nextCursor: result.nextCursor,
          hasMore: result.nextCursor !== null,
        };
      },
    },
    {
      definition: {
        name: 'save_attached_files',
        label: 'Save attached files',
        description: `Use this tool to save files attached to the active message into the user's document collection.

Use it when the user asks to keep, import, or save files attached to the current message.

Do not use it when there are no relevant attachments, the user only wants to inspect one, or the files are from another message.

The active message comes from execution context rather than a parameter; if none are attached, the tool raises an error. Saved documents are returned as document objects.`,
        parameters: schema({}),
      },
      parseArguments,
      execute: async ({ userId, sourceMessageId }) => {
        const documents = await deps.documents.listAttached(
          userId,
          sourceMessageId,
        );

        if (documents.length === 0)
          throw new Error('No files are attached to this message.');

        return {
          objectType: 'documents',
          objects: documents.map(documentSummary),
        };
      },
    },
    {
      definition: {
        name: 'send_file',
        label: 'Send file',
        description: `Use this tool to send one specific saved file back through the active WhatsApp or Telegram conversation.

Use it when the user has identified and confirmed the exact saved document. If several could match, list them and ask first.

Do not use it on dashboard chat, for unsaved attachments, or to send multiple files in one call; it always requires user confirmation. After approval the channel sends a “📂 Sending file ...” notice in English or “📂 Mengirimi file ...” in Indonesian.

documentId is required; the file is loaded from the current user's storage and sent only through the active channel.`,
        parameters: schema(
          {
            documentId: {
              ...string,
              description: 'Identifier of the single saved document to send.',
            },
          },
          ['documentId'],
        ),
      },
      requiresConfirmation: true,
      parseArguments,
      execute: async ({ userId, arguments: raw, context }) => {
        if (
          !context?.sendFile ||
          (context.channel !== 'whatsapp' && context.channel !== 'telegram')
        )
          throw new Error(
            'Files can only be sent from an active WhatsApp or Telegram conversation.',
          );

        const documentId = text(record(raw), 'documentId')!;
        const file = await deps.documents.loadFile(userId, documentId);
        if (!file) throw new Error('Document not found.');
        const sent = await context.sendFile(file);

        return {
          objectType: 'file',
          object: {
            documentId,
            filename: file.filename,
            providerMessageId: sent.providerMessageId,
          },
        };
      },
    },
    {
      definition: {
        name: 'search_documents',
        label: 'Search documents',
        description: `Use this tool to search the current user's document chunks for a semantic query.

Use it when a question needs information from saved documents or the active message's attachments.

Do not use it for a complete document read or a metadata-only file list.

Returns up to six relevance-ranked sources with document identity, filename, position, and a truncated quote; results may not cover the whole document.`,
        parameters: schema(
          {
            query: {
              ...string,
              description:
                'Required natural-language query for semantic document search.',
            },
          },
          ['query'],
        ),
      },
      parseArguments,
      execute: async ({ userId, sourceMessageId, arguments: raw }) => ({
        sources: (
          await deps.documents.searchForMessage(
            userId,
            sourceMessageId,
            text(record(raw), 'query')!,
            6,
          )
        ).map((chunk) => ({
          documentId: chunk.documentId,
          filename: chunk.title,
          page: chunk.pageNumber,
          chunk: chunk.chunkIndex,
          quote: bounded(chunk.content, SEARCH_QUOTE_CHARS),
        })),
      }),
    },
    {
      definition: {
        name: 'list_calendar_events',
        label: 'Find calendar events',
        description: `Use this tool to list calendar events in a requested time range.

Use it when the user asks what events are scheduled between two ISO datetimes.

Do not use it to create, update, or cancel events, or when a boundary is missing or not ISO.

from and to are required and parsed as ISO datetimes; the current user's events are listed without modifying the calendar.`,
        parameters: schema(
          {
            from: {
              ...string,
              description: 'Required start of the range as an ISO datetime.',
            },
            to: {
              ...string,
              description: 'Required end of the range as an ISO datetime.',
            },
          },
          ['from', 'to'],
        ),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const a = record(raw);

        return {
          events: await deps.calendars.list(
            userId,
            date(a, 'from')!,
            date(a, 'to')!,
          ),
        };
      },
    },
    {
      definition: {
        name: 'create_calendar_event',
        label: 'Create calendar event',
        description: `Use this tool to create a calendar event.

Use it when the user asks to schedule a new event with a title and time range.

Do not use it to change or cancel an existing event, or when the end is not after the start.

title, startAt, and endAt are required; description, location, and attendees are optional. Times are ISO, the user's timezone or Asia/Jakarta is used, and non-string attendees are ignored.`,
        parameters: schema(
          {
            title: {
              ...string,
              description: 'Required title for the new event.',
            },
            description: {
              ...string,
              description:
                'Optional extended event details that add information beyond the title and the other supplied fields; never restate those fields. Omit it when there are no extra details.',
            },
            location: {
              ...string,
              description: 'Optional physical or virtual location.',
            },
            startAt: {
              ...string,
              description: 'Required event start as an ISO datetime.',
            },
            endAt: {
              ...string,
              description:
                'Required event end as an ISO datetime; must be after startAt.',
            },
            attendees: {
              type: 'array',
              description: 'Optional attendee values for the event.',
              items: {
                ...string,
                description: 'An attendee identifier or address.',
              },
            },
          },
          ['title', 'startAt', 'endAt'],
        ),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const a = record(raw);
        const input: CalendarEventWrite = {
          title: text(a, 'title')!,
          description: text(a, 'description', false) ?? null,
          location: text(a, 'location', false) ?? null,
          startAt: date(a, 'startAt')!,
          endAt: date(a, 'endAt')!,
          timezone:
            (await deps.users.findById(userId))?.timezone ?? 'Asia/Jakarta',
          attendees: Array.isArray(a.attendees)
            ? a.attendees.filter((v): v is string => typeof v === 'string')
            : [],
        };

        if (input.endAt <= input.startAt)
          throw new Error('The end time must be after the start time.');

        return {
          objectType: 'calendar_event',
          object: await deps.calendarService.create(userId, input),
        };
      },
    },
    {
      definition: {
        name: 'update_calendar_event',
        label: 'Update calendar event',
        description: `Use this tool to update an existing calendar event.

Use it when the user asks to change an event and provides its event id.

Do not use it to create or cancel an event, or when the event is not identified by id.

id is required and the other fields are optional; only supplied fields are passed on, and startAt/endAt must be ISO. A missing event raises an error.`,
        parameters: schema(
          {
            id: {
              ...string,
              description: 'Required identifier of the event to update.',
            },
            title: {
              ...string,
              description: 'Optional replacement event title.',
            },
            description: {
              ...string,
              description:
                'Optional replacement extended event details that add information beyond the title and the other supplied fields; never restate those fields. Omit it to keep the current description.',
            },
            location: {
              ...string,
              description: 'Optional replacement event location.',
            },
            startAt: {
              ...string,
              description: 'Optional replacement start as an ISO datetime.',
            },
            endAt: {
              ...string,
              description: 'Optional replacement end as an ISO datetime.',
            },
          },
          ['id'],
        ),
      },
      requiresConfirmation: true,
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const a = record(raw);
        const updated = await deps.calendarService.update(
          userId,
          text(a, 'id')!,
          {
            title: text(a, 'title', false),
            description: text(a, 'description', false),
            location: text(a, 'location', false),
            startAt: date(a, 'startAt', false),
            endAt: date(a, 'endAt', false),
          },
        );

        if (!updated) throw new Error('Event not found.');

        return { objectType: 'calendar_event', object: updated };
      },
    },
    {
      definition: {
        name: 'cancel_calendar_event',
        label: 'Cancel calendar event',
        description: `Use this tool to cancel an existing calendar event.

Use it when the user explicitly asks to cancel an event and provides its id.

Do not use it to create or edit an event, or when the event is not identified by id.

Cancels for the current user; a missing event raises an error. This is a mutation that should follow the user's approval expectations.`,
        parameters: schema(
          {
            id: {
              ...string,
              description: 'Required identifier of the event to cancel.',
            },
          },
          ['id'],
        ),
      },
      requiresConfirmation: true,
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const cancelled = await deps.calendarService.cancel(
          userId,
          text(record(raw), 'id')!,
        );

        if (!cancelled) throw new Error('Event not found.');

        return { objectType: 'calendar_event', object: cancelled };
      },
    },
  ];
}
