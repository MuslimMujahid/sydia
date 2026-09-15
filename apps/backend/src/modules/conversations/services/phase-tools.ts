import type { JSONSchema7 } from 'ai';
import type { Prisma } from '../../../generated/prisma/client';
import type { CalendarEventWrite, Document } from '../../../database/entities';
import type {
  ICalendarRepository,
  IContactGroupRepository,
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
    filename: document.title,
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

function texts(
  value: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const found = value[key];
  if (found === undefined) return undefined;
  if (!Array.isArray(found))
    throw new Error(`${key} must be a list of text values.`);
  const result: string[] = [];

  for (const item of found as unknown[]) {
    if (typeof item !== 'string')
      throw new Error(`${key} must be a list of text values.`);
    const trimmed = item.trim();
    if (trimmed) result.push(trimmed);
  }

  return result;
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
  contactGroups: IContactGroupRepository;
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

The contact is created for the current user; aliases must be strings and omitted optional fields are stored as null. Optional groupNames attach the new contact to existing groups; a contact may belong to several.`,
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
            groupNames: {
              type: 'array',
              description:
                'Optional existing group names to place the contact in.',
              items: { ...string, description: 'A contact group name.' },
            },
          },
          ['name'],
        ),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const a = record(raw);
        const groupNames = texts(a, 'groupNames');
        const groups = groupNames
          ? await deps.contactGroups.findByNames(userId, groupNames)
          : [];

        if (groupNames && groups.length !== groupNames.length)
          throw new Error('One or more contact groups were not found.');

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
            ...(groupNames ? { groupIds: groups.map((g) => g.id) } : {}),
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
      readOnly: true,
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
        name: 'list_contacts',
        label: 'Find contacts',
        description: `Use this tool to list or search the current user's contacts.

Use it when the user asks who they know, or to browse contacts in a group.

Do not use it when one contact must be matched by a reference, or when nothing should be read.

Returns each contact's id, name, aliases, email, phone, notes, and groups. An optional query filters by name, alias, email, or phone; an optional groupName narrows the result to that group.`,
        parameters: schema({
          query: {
            ...string,
            description:
              'Optional text matched against name, alias, email, or phone.',
          },
          groupName: {
            ...string,
            description: 'Optional group name to list members of.',
          },
        }),
      },
      readOnly: true,
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const a = record(raw);
        const groupName = text(a, 'groupName', false);
        const group = groupName
          ? (await deps.contactGroups.findByNames(userId, [groupName]))[0]
          : undefined;

        if (groupName && !group) throw new Error('Contact group not found.');

        return {
          contacts: await deps.contacts.list(userId, {
            query: text(a, 'query', false),
            groupId: group?.id,
          }),
        };
      },
    },
    {
      definition: {
        name: 'list_contact_groups',
        label: 'View contact groups',
        description: `Use this tool to list the user's contact groups.

Use it when you need group names before assigning contacts or managing groups.

Do not use it to create, rename, or delete a group, or when group data is not needed.

Returns each group's id, name, and contact count; it does not modify them.`,
        parameters: schema({}),
      },
      readOnly: true,
      parseArguments,
      execute: async ({ userId }) => ({
        contactGroups: await deps.contactGroups.list(userId),
      }),
    },
    {
      definition: {
        name: 'create_contact_group',
        label: 'Create contact group',
        description: `Use this tool to create a new contact group.

Use it when the user asks to organize contacts under a new group name.

Do not use it when an existing group already fits, or to rename or delete one.

name is required. If a group with that name already exists for the user, the existing group is returned instead of failing, so repeating a request is safe.`,
        parameters: schema(
          {
            name: {
              ...string,
              description: 'Required contact group name.',
            },
          },
          ['name'],
        ),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const name = text(record(raw), 'name')!;
        const existing = (
          await deps.contactGroups.findByNames(userId, [name])
        )[0];

        return {
          objectType: 'contact_group',
          object:
            existing ?? (await deps.contactGroups.create(userId, { name })),
        };
      },
    },
    {
      definition: {
        name: 'update_contact_group',
        label: 'Update contact group',
        description: `Use this tool to rename an existing contact group.

Use it when the user asks to change a group's name.

Do not use it to create a group, delete one, or change which contacts belong to it.

Identify the group by currentName; newName is required and must be unique for the user.`,
        parameters: schema(
          {
            currentName: {
              ...string,
              description: 'Required current name of the group to rename.',
            },
            newName: {
              ...string,
              description: 'Required replacement group name.',
            },
          },
          ['currentName', 'newName'],
        ),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const a = record(raw);
        const current = (
          await deps.contactGroups.findByNames(userId, [
            text(a, 'currentName')!,
          ])
        )[0];

        if (!current) throw new Error('Contact group not found.');
        const group = await deps.contactGroups.update(userId, current.id, {
          name: text(a, 'newName')!,
        });

        return { objectType: 'contact_group', object: group };
      },
    },
    {
      definition: {
        name: 'delete_contact_group',
        label: 'Delete contact group',
        description: `Use this tool to delete an existing contact group.

Use it when the user explicitly asks to remove a group.

Do not use it to remove contacts; contacts stay and only their group membership is removed.

Identify the group by name. contactCount is accepted as context but is not used.`,
        parameters: schema(
          {
            name: {
              ...string,
              description: 'Required name of the group to delete.',
            },
            contactCount: {
              type: 'integer',
              minimum: 0,
              description:
                'Optional number of contacts currently in the group, for context.',
            },
          },
          ['name'],
        ),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const a = record(raw);
        const current = (
          await deps.contactGroups.findByNames(userId, [text(a, 'name')!])
        )[0];

        if (!current) throw new Error('Contact group not found.');
        const group = await deps.contactGroups.delete(userId, current.id);

        return { objectType: 'contact_group', object: group };
      },
    },
    {
      definition: {
        name: 'assign_contact_groups',
        label: 'Update contact groups',
        description: `Use this tool to change which groups one contact belongs to.

Use it when the user asks to put a contact in a group or take them out of one.

Do not use it to create or delete groups, or to edit other contact details.

Identify the contact by contactName; groupNames is required and mode adds, removes, or sets the memberships. A contact can belong to several groups.`,
        parameters: schema(
          {
            contactName: {
              ...string,
              description: 'Required name or alias of the contact to change.',
            },
            groupNames: {
              type: 'array',
              description: 'Group names to add, remove, or set.',
              items: { ...string, description: 'A contact group name.' },
            },
            mode: {
              type: 'string',
              enum: ['add', 'remove', 'set'],
              description:
                'How groupNames change the memberships; defaults to add.',
            },
          },
          ['contactName', 'groupNames'],
        ),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const a = record(raw);
        const contact = (
          await deps.contacts.resolve(userId, text(a, 'contactName')!)
        )[0];

        if (!contact) throw new Error('Contact not found.');
        const names = texts(a, 'groupNames') ?? [];
        const groups = await deps.contactGroups.findByNames(userId, names);
        if (groups.length !== names.length)
          throw new Error('One or more contact groups were not found.');

        const mode = a.mode ?? 'add';
        if (mode !== 'add' && mode !== 'remove' && mode !== 'set')
          throw new Error('mode must be add, remove, or set.');

        const currentIds = contact.groups.map((group) => group.id);
        const requested = groups.map((group) => group.id);
        const groupIds =
          mode === 'set'
            ? requested
            : mode === 'add'
              ? [...currentIds, ...requested]
              : currentIds.filter((id) => !requested.includes(id));

        const updated = await deps.contacts.update(userId, contact.id, {
          groupIds,
        });

        return { objectType: 'contact', object: updated };
      },
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
      readOnly: true,
      parseArguments,
      execute: async ({ userId }) => {
        const documents = await deps.documents.listMetadata(userId);
        const listed = documents
          .slice(0, LIST_DOCUMENTS_LIMIT)
          .map((document) => ({
            id: document.id,
            filename: document.title,
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
      readOnly: true,
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
          filename: result.document.title,
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
        description: `Use this tool to send one specific saved file back to the user through the active conversation.

Use it when the user has identified the exact saved file they want and you know its documentId.

Do not use it when more than one saved file could match the request, when the file is an unsaved attachment, or to send several files in one call.

matchingDocumentIds must list every saved file that matches the user's request; the tool sends only when exactly that one file is listed, so when several match it refuses and you must ask the user to choose. On WhatsApp and Telegram the file is sent as an attachment after a “📂 Sending file ...” notice. In web chat the result carries the file's url and a ready-to-paste Markdown link; include that link in your reply with the file name as its text.`,
        parameters: schema(
          {
            documentId: {
              ...string,
              description: 'Identifier of the single saved document to send.',
            },
            matchingDocumentIds: {
              type: 'array',
              items: {
                ...string,
                description: 'A saved document matching the request.',
              },
              description:
                'Every saved document that matches the request; the file is sent only when exactly one is listed.',
            },
          },
          ['documentId', 'matchingDocumentIds'],
        ),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw, context }) => {
        const a = record(raw);
        const documentId = text(a, 'documentId')!;
        const matchingDocumentIds = [
          ...new Set(texts(a, 'matchingDocumentIds') ?? []),
        ];

        if (matchingDocumentIds.length === 0)
          throw new Error(
            'matchingDocumentIds must list the matching saved files.',
          );
        if (matchingDocumentIds.length > 1)
          throw new Error(
            'Several files match the request. Ask the user which single file to send, then call again with that documentId.',
          );
        if (matchingDocumentIds[0] !== documentId)
          throw new Error(
            'documentId must be the single matching file listed in matchingDocumentIds.',
          );

        if (
          (context?.channel === 'whatsapp' ||
            context?.channel === 'telegram') &&
          context.sendFile
        ) {
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
        }

        const link = await deps.documents.linkFor(userId, documentId);
        if (!link) throw new Error('Document not found.');

        return {
          objectType: 'file',
          object: {
            documentId,
            filename: link.filename,
            url: link.url,
            markdownLink: `[${link.filename}](${link.url})`,
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
      readOnly: true,
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
      readOnly: true,
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

Cancels for the current user; a missing event raises an error.`,
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
