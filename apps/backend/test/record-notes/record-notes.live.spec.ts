import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/infra/prisma';
import {
  PrismaRecordNotesRepository,
  PrismaWorkspaceRepository,
  PrismaNotePresenceRepository,
  PrismaNoteWorkRepository,
} from '../../src/database/repositories';
import { RecordNotesService } from '../../src/modules/record-notes';
import { NoteMutationService } from '../../src/modules/notes/note-mutation.service';
import { createRecordNoteTools } from '../../src/modules/conversations/services/record-note-tools';
import { protectNoteTools } from '../../src/modules/conversations/services/protected-note-tools';
import type { NotesService } from '../../src/modules/notes/notes.service';
import type { DailyNoteService } from '../../src/modules/daily-notes/daily-note.service';

type RecordMetadata = Awaited<ReturnType<RecordNotesService['metadata']>>;
// This suite owns disposable PostgreSQL fixtures. Explicit opt-in separates it from unit-only runs.
const integration =
  process.env.RECORD_NOTES_DB_TEST === '1' ? describe : describe.skip;

integration('record-note PostgreSQL public contracts', () => {
  const owner = `record-qa-${randomUUID()}`;
  const other = `record-qa-${randomUUID()}`;
  let prisma: PrismaService;
  let repo: PrismaRecordNotesRepository;
  let workspace: PrismaWorkspaceRepository;
  let records: RecordNotesService;
  let presence: PrismaNotePresenceRepository;
  let work: PrismaNoteWorkRepository;
  let messageId: string;
  let tools: ReturnType<typeof createRecordNoteTools>;

  async function create() {
    return (await records.create(owner, {
      title: `Measurements ${randomUUID()}`,
      parentId: null,
      description: 'Room readings',
      requestKey: randomUUID(),
      columns: [
        { id: 'temp', name: 'Temperature', type: 'number', unit: 'C' },
        { id: 'flag', name: 'Checked', type: 'boolean' },
      ],
    })) as RecordMetadata;
  }

  async function add(id: string, revision: number, key = randomUUID()) {
    return (await records.mutate(
      owner,
      id,
      {
        revision,
        requestKey: key,
        change: {
          action: 'add_rows',
          rows: [
            { values: { temp: '0', flag: false } },
            { values: { temp: '10' } },
            { values: { temp: 'two' } },
            { values: {} },
          ],
        },
      },
      'chat',
    )) as RecordMetadata & { changedIds: string[] };
  }

  async function invoke(name: string, args: unknown, key = randomUUID()) {
    const tool = tools.find((t) => t.definition.name === name);
    if (!tool) throw new Error('Required tool missing.');

    return tool.execute({
      userId: owner,
      sourceMessageId: messageId,
      arguments: tool.parseArguments(args),
      idempotencyKey: key,
      context: {},
    });
  }

  beforeAll(async () => {
    const config = new ConfigService({ ...process.env });
    prisma = new PrismaService(config);
    repo = new PrismaRecordNotesRepository(prisma);
    workspace = new PrismaWorkspaceRepository(prisma);
    records = new RecordNotesService(repo, workspace, config);
    presence = new PrismaNotePresenceRepository(prisma);
    work = new PrismaNoteWorkRepository(prisma);
    await prisma.user.createMany({
      data: [
        {
          id: owner,
          name: 'Record QA',
          email: `${owner}@example.com`,
          emailVerified: true,
        },
        {
          id: other,
          name: 'Other QA',
          email: `${other}@example.com`,
          emailVerified: true,
        },
      ],
    });
    const conversation = await prisma.conversation.create({
      data: { userId: owner, title: 'Record tests' },
    });

    const message = await prisma.message.create({
      data: {
        userId: owner,
        conversationId: conversation.id,
        role: 'user',
        content: 'Keep my measurement records',
      },
    });

    messageId = message.id;
    // Only lifecycle resolution needs NotesService; other collaborators remain the real production stack.
    const notes = {
      list: async (userId: string) => ({ items: await workspace.list(userId) }),
    } as unknown as NotesService;

    tools = protectNoteTools(createRecordNoteTools(records), {
      mutations: new NoteMutationService(presence, work),
      notes,
      daily: {} as DailyNoteService,
    });
  });
  afterAll(async () => {
    await prisma.workspaceItem.deleteMany({
      where: { userId: { in: [owner, other] } },
    });
    await prisma.recordReceipt.deleteMany({
      where: { userId: { in: [owner, other] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } });
    await prisma.$disconnect();
  });
  it('returns schema and global bounds separately from paginated cell content', async () => {
    const table = await create();
    await add(table.id, 1);
    const metadata = await records.metadata(owner, table.id);
    expect(metadata).not.toHaveProperty('rows');
    expect(metadata).toMatchObject({
      rowCount: 4,
      columnCount: 2,
      mismatched: { temp: 1, flag: 0 },
      bounds: {
        lastRow: { position: 3 },
        lastColumn: { id: 'flag', position: 2 },
      },
    });
    const content = await records.content(owner, table.id, {
      limit: 1,
      columns: ['temp'],
    });

    expect(content.rows[0]!.cells).toEqual({
      temp: { raw: '0', status: 'typed', value: '0' },
    });
    expect(content.bounds).toEqual(metadata.bounds);
  });
  it('supports last and previous navigation without linear traversal', async () => {
    const table = await create();
    await add(table.id, 1);
    const last = await records.content(owner, table.id, {
      limit: 1,
      navigation: 'last',
    });

    expect(last.rows[0]!.position).toBe(4);
    const previous = await records.content(owner, table.id, {
      limit: 1,
      cursor: last.page.previous,
    });

    expect(previous.rows[0]!.position).toBe(3);
  });
  it('invalidates old cursors after schema changes', async () => {
    const table = await create();
    await add(table.id, 1);
    const first = await records.content(owner, table.id, { limit: 1 });
    await records.mutate(
      owner,
      table.id,
      {
        revision: 2,
        requestKey: randomUUID(),
        change: {
          action: 'schema',
          columns: [
            { id: 'temp', name: 'Temperature', type: 'number', unit: 'C' },
            { id: 'flag', name: 'Verified', type: 'boolean' },
          ],
          confirmed: true,
        },
      },
      'chat',
    );
    await expect(
      records.content(owner, table.id, { limit: 1, cursor: first.page.next }),
    ).rejects.toThrow();
  });
  it('does not expose another owner through IDs or signed cursors', async () => {
    const table = await create();
    await add(table.id, 1);
    const first = await records.content(owner, table.id, { limit: 1 });
    await expect(records.metadata(other, table.id)).rejects.toThrow();
    await expect(
      records.content(other, table.id, { limit: 1, cursor: first.page.next }),
    ).rejects.toThrow();
  });
  it('replays the original receipt without recreating deliberately deleted rows', async () => {
    const table = await create();
    const key = randomUUID();
    const added = await add(table.id, 1, key);
    await records.mutate(
      owner,
      table.id,
      {
        revision: 2,
        requestKey: randomUUID(),
        change: { action: 'delete_rows', ids: [added.changedIds[0]] },
      },
      'chat',
    );
    expect(await add(table.id, 1, key)).toEqual(added);
    expect((await records.metadata(owner, table.id)).rowCount).toBe(3);
  });
  it('rolls back mutations and receipts together when the transaction fails', async () => {
    const table = await create();
    const key = randomUUID();
    await expect(
      repo.locked(owner, async () => {
        await add(table.id, 1, key);
        throw new Error('Simulated commit failure');
      }),
    ).rejects.toThrow('Simulated commit failure');
    expect((await records.metadata(owner, table.id)).rowCount).toBe(0);
    expect(await repo.receipt(owner, key)).toBeNull();
  });
  it('requires an active manual editor lease and allows edits under that lease', async () => {
    const table = await create();
    await expect(
      records.mutate(owner, table.id, {
        revision: 1,
        requestKey: randomUUID(),
        sessionId: 'expired',
        change: { action: 'add_rows', rows: [{ values: { temp: '5' } }] },
      }),
    ).rejects.toThrow();
    await presence.acquire(owner, `custom:${table.id}`, 'manual');
    const result = (await records.mutate(owner, table.id, {
      revision: 1,
      requestKey: randomUUID(),
      sessionId: 'manual',
      change: { action: 'add_rows', rows: [{ values: { temp: '5' } }] },
    })) as RecordMetadata;

    expect(result.rowCount).toBe(1);
    await presence.release(owner, `custom:${table.id}`, 'manual');
  });
  it('defers protected tools durably until all editor sessions release', async () => {
    const table = await create();
    await presence.acquire(owner, `custom:${table.id}`, 'one');
    await presence.acquire(owner, `custom:${table.id}`, 'two');
    const key = randomUUID();
    const args = {
      id: table.id,
      revision: 1,
      batch: { rows: [{ values: { temp: '12.5' } }] },
    };

    const first = await invoke('add_record_rows', args, key);
    expect(first).toMatchObject({ status: 'deferred', saved: false });
    expect((await records.metadata(owner, table.id)).rowCount).toBe(0);
    await presence.release(owner, `custom:${table.id}`, 'one');
    expect(await invoke('add_record_rows', args, key)).toMatchObject({
      status: 'deferred',
      saved: false,
    });
    await presence.release(owner, `custom:${table.id}`, 'two');
    const result = await invoke('add_record_rows', args, key);
    expect(result).toMatchObject({ saved: true, rowCount: 1 });
    expect(await invoke('add_record_rows', args, key)).toEqual(result);
  });
  it('runs saved-data analysis while an editor is open and reports exclusions', async () => {
    const table = await create();
    await add(table.id, 1);
    await presence.acquire(owner, `custom:${table.id}`, 'reading');
    const result = await records.query(owner, {
      sources: [{ id: table.id, fields: { temperature: 'temp' } }],
      calculations: [
        { name: 'mean', op: 'average', expression: { field: 'temperature' } },
      ],
    });

    expect(result.results).toMatchObject([
      {
        calculations: {
          mean: {
            value: '5',
            unit: 'C',
            contributing: 2,
            missing: 1,
            mismatched: 1,
          },
        },
      },
    ]);
    await presence.release(owner, `custom:${table.id}`, 'reading');
  });
  it('exports a coherent saved revision through a verified download capability', async () => {
    const table = await create();
    await add(table.id, 1);
    const link = await records.exportLink(owner, table.id);
    const token = link.url.split('/').at(-1)!;
    expect((await records.download(token)).csv).toBe(
      'Temperature,Checked\r\n0,false\r\n10,\r\ntwo,\r\n,\r\n',
    );
    expect(link.revision).toBe(2);
    await records.mutate(
      owner,
      table.id,
      {
        revision: 2,
        requestKey: randomUUID(),
        change: { action: 'context', description: 'Updated' },
      },
      'chat',
    );
    await expect(records.download(token)).rejects.toThrow();
  });
  it('rejects a selected-source bypass on direct query tool execution', async () => {
    const table = await create();
    const tool = tools.find((t) => t.definition.name === 'query_record_notes')!;
    const args = tool.parseArguments({
      sources: [{ id: table.id, fields: { temperature: 'temp' } }],
    });

    await expect(
      tool.execute({
        userId: owner,
        sourceMessageId: messageId,
        idempotencyKey: randomUUID(),
        arguments: args,
        context: { sourceNoteRefs: [] },
      }),
    ).rejects.toThrow();
  });
  it('sorts saved rows without redirecting stable row identities', async () => {
    const table = await create();
    const added = await add(table.id, 1);
    await records.mutate(
      owner,
      table.id,
      {
        revision: 2,
        requestKey: randomUUID(),
        change: { action: 'sort_rows', columnId: 'temp', direction: 'desc' },
      },
      'chat',
    );
    const content = await records.content(owner, table.id, {});
    expect(content.rows[0]!.id).toBe(added.changedIds[1]);
    expect(content.rows[0]!.cells.temp).toMatchObject({ value: '10' });
  });
  it('restores a removed column and its saved values atomically from an owner receipt', async () => {
    const table = await create();
    const populated = await add(table.id, table.revision);
    const sessionId = randomUUID();
    await presence.acquire(owner, `custom:${table.id}`, sessionId);
    const removed = (await records.mutate(owner, table.id, {
      revision: populated.revision,
      requestKey: randomUUID(),
      sessionId,
      change: {
        action: 'schema',
        columns: populated.columns.filter((c) => c.id !== 'temp'),
        confirmed: true,
      },
    })) as RecordMetadata & { undoKey: string };

    const restored = (await records.mutate(owner, table.id, {
      revision: removed.revision,
      requestKey: randomUUID(),
      sessionId,
      change: { action: 'restore_columns', undoKey: removed.undoKey },
    })) as RecordMetadata;

    expect(restored.columns.map((c) => c.id)).toEqual(['temp', 'flag']);
    const page = (await records.content(owner, table.id, { limit: 50 })) as {
      rows: Array<{ cells: Record<string, { raw: string }> }>;
    };

    expect(page.rows.map((r) => r.cells.temp?.raw)).toEqual([
      '0',
      '10',
      'two',
      undefined,
    ]);
    expect(restored.mismatched.temp).toBe(1);
    await presence.release(owner, `custom:${table.id}`, sessionId);
  });
});
