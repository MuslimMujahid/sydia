import { describe, expect, jest, test } from '@jest/globals';
import type {
  ICalendarRepository,
  IContactRepository,
  IUserRepository,
} from '../../../database/interfaces';
import type { CalendarService } from '../../calendar/calendar.service';
import type { DocumentService } from '../../documents/document.service';
import { createPhaseTools } from './phase-tools';

function tools(
  overrides: Partial<{
    contacts: IContactRepository;
    documents: DocumentService;
    calendars: ICalendarRepository;
    calendarService: CalendarService;
    users: IUserRepository;
  }> = {},
) {
  return createPhaseTools({
    contacts: {} as IContactRepository,
    documents: {} as DocumentService,
    calendars: {} as ICalendarRepository,
    calendarService: {} as CalendarService,
    users: {
      findById: jest
        .fn<() => Promise<{ timezone: string }>>()
        .mockResolvedValue({ timezone: 'Asia/Jakarta' }),
    } as unknown as IUserRepository,
    ...overrides,
  });
}

describe('phase 5 and 6 assistant tools', () => {
  test('saves and resolves a contact through structured repositories', async () => {
    const create = jest
      .fn<
        (
          userId: string,
          input: unknown,
        ) => Promise<{ id: string; name: string }>
      >()
      .mockResolvedValue({ id: 'contact-1', name: 'Rina' });

    const resolve = jest
      .fn<
        (
          userId: string,
          reference: string,
        ) => Promise<Array<{ id: string; name: string }>>
      >()
      .mockResolvedValue([{ id: 'contact-1', name: 'Rina' }]);

    const available = tools({
      contacts: { create, resolve } as unknown as IContactRepository,
    });

    await available
      .find((tool) => tool.definition.name === 'save_contact')
      ?.execute({
        userId: 'user-1',
        sourceMessageId: 'message-1',
        idempotencyKey: 'one',
        arguments: { name: 'Rina', aliases: ['Bu Rina'] },
      });
    const found = await available
      .find((tool) => tool.definition.name === 'resolve_contact')
      ?.execute({
        userId: 'user-1',
        sourceMessageId: 'message-2',
        idempotencyKey: 'two',
        arguments: { reference: 'Bu Rina' },
      });

    expect(create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ name: 'Rina', aliases: ['Bu Rina'] }),
    );
    expect(found).toEqual({ contacts: [{ id: 'contact-1', name: 'Rina' }] });
  });
  test('lists document metadata without extracted content', async () => {
    const documents = [
      {
        id: 'doc-1',
        title: 'invoice.pdf',
        status: 'ready' as const,
        createdAt: new Date('2026-09-01T00:00:00Z'),
        updatedAt: new Date('2026-09-01T00:00:00Z'),
        file: {
          id: 'file-1',
          originalName: 'invoice.pdf',
          mimeType: 'application/pdf',
          size: 1234,
          kind: 'document' as const,
          createdAt: new Date('2026-09-01T00:00:00Z'),
        },
      },
    ];

    const listMetadata = jest
      .fn<(userId: string) => Promise<typeof documents>>()
      .mockResolvedValue(documents);

    const result = await tools({
      documents: { listMetadata } as unknown as DocumentService,
    })
      .find((tool) => tool.definition.name === 'list_documents')
      ?.execute({
        userId: 'user-1',
        sourceMessageId: 'message-1',
        idempotencyKey: 'list-files',
        arguments: {},
      });

    expect(listMetadata).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({
      documents: [
        {
          id: 'doc-1',
          filename: 'invoice.pdf',
          mimeType: 'application/pdf',
          size: 1234,
          status: 'ready',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('textContent');
  });

  test('reads ordered document chunks with pagination metadata', async () => {
    const document = {
      id: 'doc-1',
      title: 'deck.pdf',
      status: 'ready' as const,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      file: {
        id: 'file-1',
        originalName: 'deck.pdf',
        mimeType: 'application/pdf',
        size: 1234,
        kind: 'document' as const,
        createdAt: new Date('2026-09-01T00:00:00Z'),
      },
    };

    const read = jest
      .fn<
        (
          userId: string,
          documentId: string,
          cursor: number,
          limit: number,
        ) => Promise<{
          document: typeof document;
          chunks: Array<{
            id: string;
            chunkIndex: number;
            pageNumber: number;
            content: string;
          }>;
          nextCursor: number | null;
        }>
      >()
      .mockResolvedValue({
        document,
        chunks: [
          {
            id: 'chunk-3',
            chunkIndex: 3,
            pageNumber: 2,
            content: 'Bagian kedua dokumen.',
          },
        ],
        nextCursor: 4,
      });

    const result = await tools({
      documents: { read } as unknown as DocumentService,
    })
      .find((tool) => tool.definition.name === 'read_document')
      ?.execute({
        userId: 'user-1',
        sourceMessageId: 'message-1',
        idempotencyKey: 'read-document',
        arguments: { documentId: 'doc-1', cursor: 3, limit: 1 },
      });

    expect(read).toHaveBeenCalledWith('user-1', 'doc-1', 3, 1);
    expect(result).toEqual({
      documentId: 'doc-1',
      filename: 'deck.pdf',
      status: 'ready',
      chunks: [{ chunk: 3, page: 2, content: 'Bagian kedua dokumen.' }],
      nextCursor: 4,
      hasMore: true,
    });
  });

  test('saves every file attached to the source message', async () => {
    const attached = [
      { id: 'doc-1', title: 'invoice.pdf' },
      { id: 'doc-2', title: 'receipt.jpg' },
    ];

    const listAttached = jest
      .fn<(userId: string, messageId: string) => Promise<typeof attached>>()
      .mockResolvedValue(attached);

    const tool = tools({
      documents: { listAttached } as unknown as DocumentService,
    }).find(({ definition }) => definition.name === 'save_attached_files');

    const result = await tool?.execute({
      userId: 'user-1',
      sourceMessageId: 'message-1',
      idempotencyKey: 'save-files',
      arguments: {},
    });

    expect(listAttached).toHaveBeenCalledWith('user-1', 'message-1');
    expect(result).toEqual({ objectType: 'documents', objects: attached });
  });

  test('rejects saving when the source message has no attached files', async () => {
    const listAttached = jest
      .fn<(userId: string, messageId: string) => Promise<[]>>()
      .mockResolvedValue([]);

    const tool = tools({
      documents: { listAttached } as unknown as DocumentService,
    }).find(({ definition }) => definition.name === 'save_attached_files');

    await expect(
      tool?.execute({
        userId: 'user-1',
        sourceMessageId: 'message-1',
        idempotencyKey: 'save-files',
        arguments: {},
      }),
    ).rejects.toThrow('No files are attached to this message.');
  });

  test('returns document provenance from retrieval', async () => {
    const searchForMessage = jest
      .fn<
        (
          userId: string,
          messageId: string,
          query: string,
          limit: number,
        ) => Promise<
          Array<{
            id: string;
            documentId: string;
            title: string;
            chunkIndex: number;
            pageNumber: number;
            content: string;
          }>
        >
      >()
      .mockResolvedValue([
        {
          id: 'chunk-1',
          documentId: 'doc-1',
          title: 'invoice.pdf',
          chunkIndex: 2,
          pageNumber: 3,
          content: 'Total Rp500.000',
        },
      ]);

    const result = await tools({
      documents: { searchForMessage } as unknown as DocumentService,
    })
      .find((tool) => tool.definition.name === 'search_documents')
      ?.execute({
        userId: 'user-1',
        sourceMessageId: 'message-1',
        idempotencyKey: 'one',
        arguments: { query: 'total invoice' },
      });

    expect(searchForMessage).toHaveBeenCalledWith(
      'user-1',
      'message-1',
      'total invoice',
      6,
    );
    expect(result).toEqual({
      sources: [
        {
          documentId: 'doc-1',
          filename: 'invoice.pdf',
          page: 3,
          chunk: 2,
          quote: 'Total Rp500.000',
        },
      ],
    });
  });
  test('creates, updates, and cancels calendar events through service', async () => {
    const event = { id: 'event-1', title: 'Review' };
    const create = jest
      .fn<(userId: string, input: unknown) => Promise<typeof event>>()
      .mockResolvedValue(event);

    const update = jest
      .fn<
        (userId: string, id: string, input: unknown) => Promise<typeof event>
      >()
      .mockResolvedValue(event);

    const cancel = jest
      .fn<(userId: string, id: string) => Promise<typeof event>>()
      .mockResolvedValue(event);

    const available = tools({
      calendarService: { create, update, cancel } as unknown as CalendarService,
    });

    await available
      .find((tool) => tool.definition.name === 'create_calendar_event')
      ?.execute({
        userId: 'user-1',
        sourceMessageId: 'message-1',
        idempotencyKey: 'one',
        arguments: {
          title: 'Review',
          startAt: '2026-09-07T02:00:00Z',
          endAt: '2026-09-07T03:00:00Z',
        },
      });
    await available
      .find((tool) => tool.definition.name === 'update_calendar_event')
      ?.execute({
        userId: 'user-1',
        sourceMessageId: 'message-2',
        idempotencyKey: 'two',
        arguments: { id: 'event-1', title: 'Review final' },
      });
    await available
      .find((tool) => tool.definition.name === 'cancel_calendar_event')
      ?.execute({
        userId: 'user-1',
        sourceMessageId: 'message-3',
        idempotencyKey: 'three',
        arguments: { id: 'event-1' },
      });
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      'user-1',
      'event-1',
      expect.objectContaining({ title: 'Review final' }),
    );
    expect(cancel).toHaveBeenCalledWith('user-1', 'event-1');
  });

  test('documents every phase tool and parameter in English', () => {
    const available = tools();

    const visit = (value: unknown, root = false): void => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const schema = value as Record<string, unknown>;
      if (!root) expect(schema.description).toEqual(expect.any(String));

      if (schema.properties && typeof schema.properties === 'object') {
        for (const property of Object.values(
          schema.properties as Record<string, unknown>,
        )) {
          visit(property);
        }
      }

      if (schema.items) visit(schema.items);
    };

    expect(available).toHaveLength(10);

    for (const assistantTool of available) {
      expect(assistantTool.definition.description).toMatch(
        /^Use this tool to [\s\S]+\n\nUse it when [\s\S]+\n\nDo not use it [\s\S]+\n\n[\s\S]+\n\n---\n\nParameters:/,
      );
      visit(assistantTool.definition.parameters, true);
    }
  });
});
