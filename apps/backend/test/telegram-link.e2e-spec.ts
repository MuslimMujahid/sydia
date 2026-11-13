import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/infra/prisma';
import { PrismaTelegramRepository } from '../src/database/repositories';

describe('Telegram account transfers', () => {
  const previousOwner = `telegram-previous-${randomUUID()}`;
  const newOwner = `telegram-new-${randomUUID()}`;
  const externalId = `telegram-${randomUUID()}`;
  const now = new Date('2026-11-13T00:00:00Z');
  const input = {
    tokenHash: `telegram-token-${randomUUID()}`,
    externalId,
    now,
  };

  let db: PrismaService;
  let repository: PrismaTelegramRepository;
  let previousIdentityId: string;
  let replacementIdentityId: string;
  let previousConversationId: string;

  beforeAll(() => {
    db = new PrismaService(new ConfigService());
    repository = new PrismaTelegramRepository(db);
  });

  beforeEach(async () => {
    await db.user.createMany({
      data: [
        {
          id: previousOwner,
          name: 'Previous Telegram owner',
          email: `${previousOwner}@test.invalid`,
        },
        {
          id: newOwner,
          name: 'New Telegram owner',
          email: `${newOwner}@test.invalid`,
        },
      ],
    });
    const previousIdentity = await db.externalIdentity.create({
      data: { userId: previousOwner, provider: 'telegram', externalId },
    });

    previousIdentityId = previousIdentity.id;
    const replacementIdentity = await db.externalIdentity.create({
      data: {
        userId: newOwner,
        provider: 'telegram',
        externalId: `${externalId}-replacement`,
      },
    });

    replacementIdentityId = replacementIdentity.id;
    const previousConversation = await db.conversation.create({
      data: {
        userId: previousOwner,
        channel: 'telegram',
        messages: {
          create: {
            userId: previousOwner,
            role: 'user',
            content: 'Private history of the previous account',
          },
        },
        channelConversations: {
          create: {
            provider: 'telegram',
            externalIdentityId: previousIdentityId,
            chatExternalId: externalId,
            lastInboundAt: now,
          },
        },
      },
    });

    previousConversationId = previousConversation.id;
    await repository.createLinkToken({
      userId: newOwner,
      tokenHash: input.tokenHash,
      expiresAt: new Date('2026-11-13T00:10:00Z'),
    });
  });

  afterEach(async () => {
    await db.user.deleteMany({
      where: { id: { in: [previousOwner, newOwner] } },
    });
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  it('moves the connection to the new account without transferring private history', async () => {
    const result = await repository.commitLink(input);

    expect(result.status).toBe('linked');
    expect(await repository.findIdentity(previousOwner)).toBeNull();
    const linked = await repository.findIdentity(newOwner);
    expect(linked).toMatchObject({ userId: newOwner, externalId });
    expect(linked?.id).not.toBe(previousIdentityId);
    expect(linked?.id).not.toBe(replacementIdentityId);
    expect(await repository.findIdentityByExternalId(externalId)).toEqual(
      linked,
    );
    expect(
      await repository.findIdentityByExternalId(`${externalId}-replacement`),
    ).toBeNull();
    expect(
      await db.channelConversation.count({
        where: { externalIdentityId: linked?.id },
      }),
    ).toBe(0);
    expect(
      await db.conversation.findUnique({
        where: { id: previousConversationId },
        select: { userId: true, messages: { select: { content: true } } },
      }),
    ).toEqual({
      userId: previousOwner,
      messages: [{ content: 'Private history of the previous account' }],
    });
    await expect(repository.commitLink(input)).resolves.toEqual({
      status: 'token_unavailable',
    });
  });

  it('restores both connections and the token when the new binding fails', async () => {
    // Inject failure at the database boundary; the transaction itself is real.
    const failingDatabase = db.$extends({
      query: {
        externalIdentity: {
          create() {
            throw new Error('Simulated identity insert failure');
          },
        },
      },
    });

    const failingRepository = new PrismaTelegramRepository(
      failingDatabase as unknown as PrismaService,
    );

    await expect(failingRepository.commitLink(input)).rejects.toThrow(
      'Simulated identity insert failure',
    );

    expect(await repository.findIdentity(previousOwner)).toMatchObject({
      id: previousIdentityId,
      externalId,
    });
    expect(await repository.findIdentity(newOwner)).toMatchObject({
      id: replacementIdentityId,
      externalId: `${externalId}-replacement`,
    });
    expect(
      await db.channelConversation.count({
        where: { externalIdentityId: previousIdentityId },
      }),
    ).toBe(1);
    expect(
      await db.telegramLinkToken.findUnique({
        where: { tokenHash: input.tokenHash },
        select: { consumedAt: true },
      }),
    ).toEqual({ consumedAt: null });
  });

  it('keeps both connections unchanged when the transfer token has expired', async () => {
    await expect(
      repository.commitLink({
        ...input,
        now: new Date('2026-11-13T00:10:00Z'),
      }),
    ).resolves.toEqual({ status: 'token_unavailable' });

    expect(await repository.findIdentity(previousOwner)).toMatchObject({
      id: previousIdentityId,
    });
    expect(await repository.findIdentity(newOwner)).toMatchObject({
      id: replacementIdentityId,
    });
  });
});
