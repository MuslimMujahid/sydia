import type { JSONSchema7 } from 'ai';
import type { Prisma } from '../../../generated/prisma/client';
import type { CalendarEventWrite } from '../../../database/entities';
import type {
  ICalendarRepository,
  IContactRepository,
  IUserRepository,
} from '../../../database/interfaces';
import { CalendarService } from '../../calendar/calendar.service';
import { DocumentService } from '../../documents/document.service';
import type { AssistantTool } from './tool-executor.service';

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

Do not use it when the user only wants to find an existing contact or when no contact should be persisted.

The contact is created for the current user. Alias values that are not strings are ignored, and omitted optional text fields are stored as null.

---

Parameters: name is the contact's required display name; aliases is an optional array of alternate names; email is an optional email address; phone is an optional phone number; notes is optional free-form context.`,
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

Use it when the user asks to look up an existing contact by name, alias, email, or phone number.

Do not use it when the user wants to create or modify contact details.

The reference is resolved for the current user and may match by name, alias, email, or phone number; the tool returns matching contacts and does not create or change them.

---

Parameters: reference is the required name, alias, email address, or phone number to resolve.`,
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

Use it when the user asks what files or documents are available in their collection, or you just need a quick overview of their documents.

Do not use it when the user needs document contents, semantic search results, or attached files from the active message.

The result includes each document's ID, filename, MIME type, size, processing status, and creation time; document contents are excluded. This tool takes no parameters.

---

Parameters: none.`,
        parameters: schema({}),
      },
      parseArguments,
      execute: async ({ userId }) => ({
        documents: (await deps.documents.listMetadata(userId)).map(
          (document) => ({
            id: document.id,
            filename: document.file.originalName,
            mimeType: document.file.mimeType,
            size: document.file.size,
            status: document.status,
            createdAt: document.createdAt,
          }),
        ),
      }),
    },
    {
      definition: {
        name: 'read_document',
        label: 'Read document',
        description: `Use this tool to read content chunks from one saved document.

Use it when you need to read the contents of a specific document and you have its document ID.

Do not use it when the user only needs a file list, wants semantic search across documents, or has not identified a document.

The required document ID is read for the current user. cursor defaults to 0 and limit defaults to 8; limit must be from 1 through 20. A missing document raises an error, and the result contains metadata, chunks with page positions, nextCursor, and hasMore.

---

Parameters: documentId is the required document identifier; cursor is an optional non-negative starting chunk offset; limit is an optional number of chunks from 1 through 20.`,
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
              maximum: 20,
              description:
                'Optional number of chunks to return, from 1 through 20; defaults to 8.',
            },
          },
          ['documentId'],
        ),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const a = record(raw);
        const cursor = integer(a, 'cursor', 0);
        const limit = integer(a, 'limit', 8);
        if (cursor < 0 || limit < 1 || limit > 20)
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
            content: chunk.content,
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

Do not use it when there are no relevant attachments, when the user only wants to inspect an attachment, or when saving files from another message.

The active message is identified by execution context rather than a parameter. All attached files are listed for the current user; if none are attached, the tool raises an error. Saved documents are returned as document objects.

---

Parameters: none; the active message comes from execution context.`,
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

        return { objectType: 'documents', objects: documents };
      },
    },
    {
      definition: {
        name: 'send_file',
        label: 'Send file',
        description: `Use this tool to send one specific saved file back through the active WhatsApp or Telegram conversation.

Use it when the user has identified and confirmed the exact saved document they want. If the request could refer to more than one file, list or resolve the candidates and ask which one before calling this tool.

Do not use it on dashboard chat, for attached files that have not been saved, or to send multiple files in one call. This operation always requires user confirmation. After approval, the channel sends “📂 Sending file ...” in English or “📂 Mengirimi file ...” in Indonesian before sending the file.

The document ID is required. The file is loaded from the current user's storage and sent only through the active messaging channel.

---

Parameters: documentId is the required identifier of the single saved document to send.`,
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

Use it when the user asks a question that requires finding relevant information in their saved documents or files attached to the active message.

Do not use it when the user needs a complete document read, or a metadata-only file list.

The query is searched in the current message's document context and returns up to 6 relevance-ranked sources with document identity, filename, page or chunk position, and a quote; results may not cover the complete document.

---

Parameters: query is the required natural-language search query.`,
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
          quote: chunk.content,
        })),
      }),
    },
    {
      definition: {
        name: 'list_calendar_events',
        label: 'Find calendar events',
        description: `Use this tool to list calendar events in a requested time range.

Use it when the user asks what events are scheduled between two ISO datetimes.

Do not use it when the user wants to create, update, or cancel an event, or when either boundary is missing or not an ISO datetime.

Both range boundaries are required and parsed as ISO datetimes. Events are listed for the current user between from and to; this tool does not modify the calendar.

---

Parameters: from is the required starting ISO datetime; to is the required ending ISO datetime.`,
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

Do not use it when the user is referring to an existing event that should be changed or cancelled, or when the end time is not after the start time.

Title, startAt, and endAt are required; description, location, and attendees are optional. startAt and endAt must be ISO datetimes, the user's timezone is used when available (otherwise Asia/Jakarta), and the event is created for the current user. Non-string attendee values are ignored.

---

Parameters: title is the required event title; description is optional event detail; location is optional place or meeting information; startAt and endAt are required ISO datetimes; attendees is an optional array of attendee strings.`,
        parameters: schema(
          {
            title: {
              ...string,
              description: 'Required title for the new event.',
            },
            description: {
              ...string,
              description: 'Optional description of the event.',
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

Use it when the user asks to change an event and provides its event ID.

Do not use it when the user wants to create a new event, cancel an event, or has not identified the event by ID.

id is required and the other fields are optional; only supplied fields are passed to the calendar service. startAt and endAt, when supplied, must be ISO datetimes. If the ID does not identify an event for the current user, the tool raises an error.

---

Parameters: id is the required event identifier; title, description, and location are optional replacement values; startAt and endAt are optional ISO datetimes.`,
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
              description: 'Optional replacement event description.',
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

Use it when the user explicitly asks to cancel an event and provides its event ID.

Do not use it when the user wants to create or edit an event, or when the event has not been identified by ID.

The event is cancelled for the current user. If no matching event exists, the tool raises an error; cancellation is a calendar mutation and should follow the user's approval expectations.

---

Parameters: id is the required identifier of the event to cancel.`,
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
