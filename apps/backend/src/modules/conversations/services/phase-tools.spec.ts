import { describe, expect, jest, test } from '@jest/globals';
import type {
  ICalendarRepository,
  IContactGroupRepository,
  IContactRepository,
  IUserRepository,
} from '../../../database/interfaces';
import type { CalendarService } from '../../calendar/calendar.service';
import type { DocumentService } from '../../documents/document.service';
import { createPhaseTools } from './phase-tools';

function tools(
  overrides: Partial<{
    contacts: IContactRepository;
    contactGroups: IContactGroupRepository;
    documents: DocumentService;
    calendars: ICalendarRepository;
    calendarService: CalendarService;
    users: IUserRepository;
  }> = {},
) {
  return createPhaseTools({
    contacts: {} as IContactRepository,
    contactGroups: {} as IContactGroupRepository,
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

  test('assigns contact groups by adding, removing, or replacing memberships', async () => {
    const groups = [
      { id: 'group-1', name: 'Keluarga' },
      { id: 'group-2', name: 'Kantor' },
    ];

    const findByNames = jest
      .fn<(userId: string, names: string[]) => Promise<typeof groups>>()
      .mockImplementation((_userId, names) =>
        Promise.resolve(
          groups.filter((group) =>
            names.some(
              (name) => name.toLowerCase() === group.name.toLowerCase(),
            ),
          ),
        ),
      );

    const update = jest
      .fn<(userId: string, id: string, input: unknown) => Promise<unknown>>()
      .mockResolvedValue({ id: 'contact-1', name: 'Rina' });

    const resolve = jest
      .fn<(userId: string, reference: string) => Promise<unknown[]>>()
      .mockResolvedValue([
        {
          id: 'contact-1',
          name: 'Rina',
          groups: [{ id: 'group-1', name: 'Keluarga' }],
        },
      ]);

    const available = tools({
      contacts: { resolve, update } as unknown as IContactRepository,
      contactGroups: { findByNames } as unknown as IContactGroupRepository,
    });

    const execute = (argumentsValue: unknown) =>
      available
        .find((tool) => tool.definition.name === 'assign_contact_groups')
        ?.execute({
          userId: 'user-1',
          sourceMessageId: 'message-3',
          idempotencyKey: 'three',
          arguments: argumentsValue as never,
        });

    await execute({ contactName: 'Rina', groupNames: ['Kantor'] });
    await execute({
      contactName: 'Rina',
      groupNames: ['Keluarga'],
      mode: 'remove',
    });
    await execute({
      contactName: 'Rina',
      groupNames: ['Kantor'],
      mode: 'set',
    });

    expect(update).toHaveBeenNthCalledWith(1, 'user-1', 'contact-1', {
      groupIds: ['group-1', 'group-2'],
    });
    expect(update).toHaveBeenNthCalledWith(2, 'user-1', 'contact-1', {
      groupIds: [],
    });
    expect(update).toHaveBeenNthCalledWith(3, 'user-1', 'contact-1', {
      groupIds: ['group-2'],
    });
  });

  test('refuses to save a contact when a named group does not exist', async () => {
    const create = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValue({ id: 'contact-1', name: 'Rina' });

    const findByNames = jest
      .fn<() => Promise<Array<{ id: string; name: string }>>>()
      .mockResolvedValue([]);

    await expect(
      tools({
        contacts: { create } as unknown as IContactRepository,
        contactGroups: { findByNames } as unknown as IContactGroupRepository,
      })
        .find((tool) => tool.definition.name === 'save_contact')
        ?.execute({
          userId: 'user-1',
          sourceMessageId: 'message-4',
          idempotencyKey: 'four',
          arguments: { name: 'Rina', groupNames: ['Keluarga'] },
        }),
    ).rejects.toThrow('contact groups were not found');
    expect(create).not.toHaveBeenCalled();
  });

  test('creates a contact group immediately', async () => {
    const create = jest
      .fn<(userId: string, input: { name: string }) => Promise<unknown>>()
      .mockResolvedValue({ id: 'group-1', name: 'Teman Kerja' });

    const tool = tools({
      contactGroups: {
        create,
        findByNames: jest.fn<() => Promise<never[]>>().mockResolvedValue([]),
      } as unknown as IContactGroupRepository,
    }).find(({ definition }) => definition.name === 'create_contact_group');

    await expect(
      tool?.execute({
        userId: 'user-1',
        sourceMessageId: 'message-5',
        idempotencyKey: 'five',
        arguments: { name: 'Teman Kerja' },
      }),
    ).resolves.toEqual({
      objectType: 'contact_group',
      object: { id: 'group-1', name: 'Teman Kerja' },
    });
    expect(create).toHaveBeenCalledWith('user-1', { name: 'Teman Kerja' });
  });

  test('returns the existing group instead of failing on a repeated name', async () => {
    const existing = { id: 'group-9', name: 'Teman Kerja' };
    type GroupRow = { id: string; name: string };

    const create = jest
      .fn<() => Promise<GroupRow>>()
      .mockResolvedValue({ id: 'new', name: 'Teman Kerja' });

    const result = await tools({
      contactGroups: {
        create,
        findByNames: jest
          .fn<() => Promise<GroupRow[]>>()
          .mockResolvedValue([existing]),
      } as unknown as IContactGroupRepository,
    })
      .find(({ definition }) => definition.name === 'create_contact_group')
      ?.execute({
        userId: 'user-1',
        sourceMessageId: 'message-6',
        idempotencyKey: 'six',
        arguments: { name: 'teman kerja' },
      });

    expect(result).toEqual({ objectType: 'contact_group', object: existing });
    expect(create).not.toHaveBeenCalled();
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

  test('saves every file attached to the source message as compact metadata', async () => {
    const attached = [
      {
        id: 'doc-1',
        title: 'invoice.pdf',
        status: 'ready' as const,
        textContent: 'a'.repeat(5000),
        file: {
          originalName: 'invoice.pdf',
          mimeType: 'application/pdf',
          size: 1234,
        },
      },
      {
        id: 'doc-2',
        title: 'receipt.jpg',
        status: 'ready' as const,
        transcript: 'b'.repeat(5000),
        file: {
          originalName: 'receipt.jpg',
          mimeType: 'image/jpeg',
          size: 4321,
        },
      },
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
    expect(result).toEqual({
      objectType: 'documents',
      objects: [
        {
          id: 'doc-1',
          filename: 'invoice.pdf',
          mimeType: 'application/pdf',
          size: 1234,
          status: 'ready',
        },
        {
          id: 'doc-2',
          filename: 'receipt.jpg',
          mimeType: 'image/jpeg',
          size: 4321,
          status: 'ready',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('textContent');
    expect(JSON.stringify(result)).not.toContain('transcript');
  });

  test('sends one resolved document through the active channel', async () => {
    const file = {
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('invoice'),
    };

    const loadFile = jest
      .fn<(userId: string, documentId: string) => Promise<typeof file>>()
      .mockResolvedValue(file);

    const sendFile = jest
      .fn<
        (value: {
          filename: string;
          mimeType: string;
          buffer: Buffer;
        }) => Promise<{ providerMessageId: string }>
      >()
      .mockResolvedValue({ providerMessageId: 'chat:44' });

    const tool = tools({
      documents: { loadFile } as unknown as DocumentService,
    }).find(({ definition }) => definition.name === 'send_file');

    await expect(
      tool?.execute({
        userId: 'user-1',
        sourceMessageId: 'message-1',
        idempotencyKey: 'send-file',
        arguments: {
          documentId: 'doc-1',
          matchingDocumentIds: ['doc-1'],
        },
        context: { channel: 'telegram', sendFile },
      }),
    ).resolves.toEqual({
      objectType: 'file',
      object: {
        documentId: 'doc-1',
        filename: 'invoice.pdf',
        providerMessageId: 'chat:44',
      },
    });
    expect(loadFile).toHaveBeenCalledWith('user-1', 'doc-1');
    expect(sendFile).toHaveBeenCalledWith(file);
  });

  test('refuses ambiguous matches without sending a file', async () => {
    const sendFile = jest
      .fn<
        (value: {
          filename: string;
          mimeType: string;
          buffer: Buffer;
        }) => Promise<{ providerMessageId: string }>
      >()
      .mockResolvedValue({ providerMessageId: 'chat:44' });

    const loadFile = jest.fn();
    const tool = tools({
      documents: { loadFile } as unknown as DocumentService,
    }).find(({ definition }) => definition.name === 'send_file');

    await expect(
      tool?.execute({
        userId: 'user-1',
        sourceMessageId: 'message-1',
        idempotencyKey: 'ambiguous',
        arguments: {
          documentId: 'doc-1',
          matchingDocumentIds: ['doc-1', 'doc-2'],
        },
        context: { channel: 'telegram', sendFile },
      }),
    ).rejects.toThrow(
      'Several files match the request. Ask the user which single file to send, then call again with that documentId.',
    );
    expect(sendFile).not.toHaveBeenCalled();
    expect(loadFile).not.toHaveBeenCalled();
  });

  test('returns a web link without loading the file buffer', async () => {
    const linkFor = jest
      .fn<
        (
          userId: string,
          documentId: string,
        ) => Promise<{ filename: string; url: string } | null>
      >()
      .mockResolvedValue({
        filename: 'Product Requirement.pdf',
        url: 'http://localhost:5000/documents/doc-1/content',
      });

    const loadFile = jest.fn();
    const tool = tools({
      documents: { linkFor, loadFile } as unknown as DocumentService,
    }).find(({ definition }) => definition.name === 'send_file');

    await expect(
      tool?.execute({
        userId: 'user-1',
        sourceMessageId: 'message-1',
        idempotencyKey: 'web-link',
        arguments: {
          documentId: 'doc-1',
          matchingDocumentIds: ['doc-1'],
        },
      }),
    ).resolves.toEqual({
      objectType: 'file',
      object: {
        documentId: 'doc-1',
        filename: 'Product Requirement.pdf',
        url: 'http://localhost:5000/documents/doc-1/content',
        markdownLink:
          '[Product Requirement.pdf](http://localhost:5000/documents/doc-1/content)',
      },
    });
    expect(loadFile).not.toHaveBeenCalled();
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

  test('bounds a document read to the default limit and truncates long chunks', async () => {
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
            id: 'chunk-0',
            chunkIndex: 0,
            pageNumber: 1,
            content: 'a'.repeat(2000),
          },
        ],
        nextCursor: null,
      });

    const result = await tools({
      documents: { read } as unknown as DocumentService,
    })
      .find((tool) => tool.definition.name === 'read_document')
      ?.execute({
        userId: 'user-1',
        sourceMessageId: 'message-1',
        idempotencyKey: 'read-bounded',
        arguments: { documentId: 'doc-1' },
      });

    expect(read).toHaveBeenCalledWith('user-1', 'doc-1', 0, 4);
    const [chunk] = (result as { chunks: Array<{ content: string }> }).chunks;
    expect(chunk?.content).toHaveLength(801);
    expect(chunk?.content.endsWith('…')).toBe(true);
    expect(result).toEqual(expect.objectContaining({ hasMore: false }));
  });

  test('caps a large document list and reports the total', async () => {
    const documents = Array.from({ length: 30 }, (_value, index) => ({
      id: `doc-${index}`,
      title: `file-${index}.pdf`,
      status: 'ready' as const,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      file: {
        id: `file-${index}`,
        originalName: `file-${index}.pdf`,
        mimeType: 'application/pdf',
        size: index,
        kind: 'document' as const,
        createdAt: new Date('2026-09-01T00:00:00Z'),
      },
    }));

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
        idempotencyKey: 'list-capped',
        arguments: {},
      });

    const listed = result as { documents: unknown[]; total: number };

    expect(listed.total).toBe(30);
    expect(listed.documents).toHaveLength(25);
  });

  test('truncates long document search quotes', async () => {
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
          content: 'x'.repeat(2000),
        },
      ]);

    const result = await tools({
      documents: { searchForMessage } as unknown as DocumentService,
    })
      .find((tool) => tool.definition.name === 'search_documents')
      ?.execute({
        userId: 'user-1',
        sourceMessageId: 'message-1',
        idempotencyKey: 'search-bounded',
        arguments: { query: 'total invoice' },
      });

    const [source] = (result as { sources: Array<{ quote: string }> }).sources;
    expect(source?.quote).toHaveLength(601);
    expect(source?.quote.endsWith('…')).toBe(true);
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

    expect(available).toHaveLength(17);

    for (const assistantTool of available) {
      expect(assistantTool.definition.description).toMatch(
        /^Use this tool to [\s\S]+\n\nUse it when [\s\S]+\n\nDo not use it [\s\S]+\n\n[\s\S]+$/,
      );
      visit(assistantTool.definition.parameters, true);
    }
  });
});
