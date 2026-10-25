import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma';
import { PrismaConversationRepository } from './prisma-conversation.repository';
import type { ChatSegment } from '../entities';

const url = process.env.CHAT_SOURCES_CONTRACT_DB_URL;
if (url && new URL(url).pathname !== '/sydia_chat_sources_contract')
  throw new Error(
    'Chat source tests require the dedicated sydia_chat_sources_contract database.',
  );
const live = url ? describe : describe.skip;
live('Chat source PostgreSQL contracts', () => {
  let db: PrismaService;
  let conversations: PrismaConversationRepository;
  const owner = 'chat-source-owner';
  const stranger = 'chat-source-stranger';
  const folder: ChatSegment = {
    type: 'source',
    source: { kind: 'folder', id: 'root', label: 'Untrusted' },
  };

  beforeAll(async () => {
    db = new PrismaService(new ConfigService({ BACKEND_DB_URL: url }));
    await db.$connect();
    conversations = new PrismaConversationRepository(db);
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe('TRUNCATE TABLE "user" CASCADE');
    await db.user.createMany({
      data: [
        { id: owner, name: 'Owner', email: 'source-owner@example.test' },
        {
          id: stranger,
          name: 'Stranger',
          email: 'source-stranger@example.test',
        },
      ],
    });
    await db.fileFolder.createMany({
      data: [
        { id: 'root', userId: owner, name: 'Work', normalizedName: 'work' },
        {
          id: 'child',
          userId: owner,
          parentId: 'root',
          name: 'Plans',
          normalizedName: 'plans',
        },
      ],
    });
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  async function file(
    id: string,
    folderId: string | null = 'child',
    userId = owner,
  ) {
    await db.fileAsset.create({
      data: {
        id: `asset-${id}`,
        userId,
        originalName: `${id}.txt`,
        mimeType: 'text/plain',
        kind: 'document',
        size: 10,
        checksum: 'fixture',
        storageKey: `chat-sources/${id}`,
      },
    });
    await db.document.create({
      data: {
        id,
        userId,
        title: `${id}.txt`,
        fileAssetId: `asset-${id}`,
        folderId,
        status: 'ready',
      },
    });
  }

  test('expands all descendants once and deduplicates a separately referenced file', async () => {
    await file('budget');
    await file('schedule', 'root');
    const result = await conversations.writeUserMessage({
      userId: owner,
      content: 'Compare',
      idempotencyKey: 'first',
      sourceSegments: [
        folder,
        {
          type: 'source',
          source: { kind: 'file', id: 'budget', label: 'Wrong' },
        },
      ],
    });

    expect(result.userMessage.sourceDocumentIds?.sort()).toEqual([
      'budget',
      'schedule',
    ]);
    expect(result.userMessage.sourceSegments).toEqual([
      { type: 'source', source: { kind: 'folder', id: 'root', label: 'Work' } },
      {
        type: 'source',
        source: { kind: 'file', id: 'budget', label: 'budget.txt' },
      },
    ]);
  });
  test('replay excludes a newly added descendant while a new message includes it', async () => {
    await file('before');
    const input = {
      userId: owner,
      content: 'Read Work',
      idempotencyKey: 'accepted',
      sourceSegments: [folder],
    };

    await conversations.writeUserMessage(input);
    await file('later');
    const replay = await conversations.writeUserMessage(input);
    const fresh = await conversations.writeUserMessage({
      ...input,
      idempotencyKey: 'new-message',
    });

    expect(replay.userMessage.sourceDocumentIds).toEqual(['before']);
    expect(fresh.userMessage.sourceDocumentIds?.sort()).toEqual([
      'before',
      'later',
    ]);
  });
  test('renames and moves retain original identity and historical labels', async () => {
    await file('budget');
    const accepted = await conversations.writeUserMessage({
      userId: owner,
      content: 'Read',
      idempotencyKey: 'rename',
      sourceSegments: [
        folder,
        {
          type: 'source',
          source: { kind: 'file', id: 'budget', label: 'Budget' },
        },
      ],
    });

    await db.document.update({
      where: { id: 'budget' },
      data: { title: 'Renamed.txt', folderId: null },
    });
    await db.fileFolder.update({
      where: { id: 'root' },
      data: { name: 'Renamed work', normalizedName: 'renamed work' },
    });
    const scope = await conversations.findSourceScope(
      owner,
      accepted.userMessage.id,
    );

    expect(scope?.documentIds).toEqual(['budget']);
    expect(scope?.segments).toEqual([
      { type: 'source', source: { kind: 'folder', id: 'root', label: 'Work' } },
      {
        type: 'source',
        source: { kind: 'file', id: 'budget', label: 'budget.txt' },
      },
    ]);
  });
  test('a foreign-owned source fails before any message is accepted', async () => {
    await file('foreign', null, stranger);
    await expect(
      conversations.writeUserMessage({
        userId: owner,
        content: 'Read',
        idempotencyKey: 'foreign',
        sourceSegments: [
          {
            type: 'source',
            source: { kind: 'file', id: 'foreign', label: 'Mine' },
          },
        ],
      }),
    ).rejects.toThrow('File sumber tidak tersedia');
    expect(await db.message.count()).toBe(0);
  });
  test('deletion after acceptance blocks reading instead of substituting a same-title file', async () => {
    await file('original');
    const accepted = await conversations.writeUserMessage({
      userId: owner,
      content: 'Read',
      idempotencyKey: 'deleted',
      sourceSegments: [folder],
    });

    await db.document.delete({ where: { id: 'original' } });
    await file('replacement');
    await db.document.update({
      where: { id: 'replacement' },
      data: { title: 'original.txt' },
    });
    await expect(
      conversations.findSourceScope(owner, accepted.userMessage.id),
    ).rejects.toThrow('file sumber tidak tersedia');
  });
  test('a large folder persists complete membership outside the reference manifest', async () => {
    const assets = Array.from({ length: 1001 }, (_, i) => ({
      id: `asset-${i}`,
      userId: owner,
      originalName: `${i}.txt`,
      mimeType: 'text/plain',
      kind: 'document',
      size: 10,
      checksum: 'fixture',
      storageKey: `large/${i}`,
    }));

    await db.fileAsset.createMany({ data: assets });
    await db.document.createMany({
      data: assets.map((asset, i) => ({
        id: `file-${i}`,
        userId: owner,
        fileAssetId: asset.id,
        title: asset.originalName,
        folderId: i % 2 ? 'root' : 'child',
        status: 'ready',
      })),
    });
    const accepted = await conversations.writeUserMessage({
      userId: owner,
      content: 'Read',
      idempotencyKey: 'large',
      sourceSegments: [folder],
    });

    expect(accepted.userMessage.sourceDocumentIds).toHaveLength(1001);
    expect(accepted.userMessage.sourceSegments).toEqual([
      { type: 'source', source: { kind: 'folder', id: 'root', label: 'Work' } },
    ]);
  });
});
