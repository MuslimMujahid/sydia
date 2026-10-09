import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { User } from '../entities';
import type { PrismaService } from '../../infra/prisma';
import { ChatPreviewService } from '../../modules/conversations/services/chat-preview.service';
import { PrismaChatPreviewRepository } from './prisma-chat-preview.repository';
import { PrismaUserRepository } from './prisma-user.repository';

const timestamp = new Date('2026-10-09T08:00:00.000Z');
const sessionId = '11111111-1111-4111-8111-111111111111';
const owner: User = {
  id: 'developer',
  name: 'Developer',
  email: 'developer@example.test',
  emailVerified: true,
  image: null,
  role: 'user',
  timezone: 'Asia/Makassar',
  locale: 'en',
  onboardingCompleted: true,
  automaticMemoryEnabled: true,
  persona: 'friendly',
  preferredAddress: 'Dev',
  createdAt: timestamp,
  updatedAt: timestamp,
};

type FixtureUser = User & { banned?: boolean; banReason?: string };
type NewUser = Pick<
  FixtureUser,
  | 'id'
  | 'email'
  | 'name'
  | 'timezone'
  | 'locale'
  | 'persona'
  | 'preferredAddress'
  | 'role'
  | 'banned'
  | 'banReason'
  | 'onboardingCompleted'
  | 'automaticMemoryEnabled'
>;
type Preferences = {
  userId: string;
  briefingEnabled: boolean;
  webNotificationsEnabled: boolean;
  telegramNotificationsEnabled: boolean;
  whatsappNotificationsEnabled: boolean;
};

function setup(environment: string | undefined = 'development') {
  const users = new Map<string, FixtureUser>([[owner.id, { ...owner }]]);
  const preferences = new Map<string, Preferences>();
  const delegates = {
    user: {
      createMany: ({ data }: { data: NewUser[] }) => {
        for (const user of data)
          if (!users.has(user.id))
            users.set(user.id, { ...owner, ...user, emailVerified: false });

        return Promise.resolve();
      },
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(users.get(where.id) ?? null),
    },
    userPreference: {
      createMany: ({ data }: { data: Preferences[] }) => {
        for (const preference of data)
          if (!preferences.has(preference.userId))
            preferences.set(preference.userId, preference);

        return Promise.resolve();
      },
    },
  };

  const connection = {
    ...delegates,
    $transaction: async <T>(
      work: (transaction: typeof delegates) => Promise<T>,
    ): Promise<T> => work(delegates),
  };

  // Mock only the database connection; both repository adapters and the service run.
  const prisma = connection as unknown as PrismaService;
  const service = new ChatPreviewService(
    new ConfigService({ NODE_ENV: environment }),
    new PrismaUserRepository(prisma),
    new PrismaChatPreviewRepository(prisma),
  );

  return { service, users, preferences };
}

describe('development chat sandbox ownership', () => {
  it('keeps normal requests on the authenticated user', async () => {
    const { service, users } = setup('production');
    expect(await service.resolve(owner, {}, true)).toBe(owner);
    expect(users.size).toBe(1);
  });

  it('creates a distinct data owner for each channel', async () => {
    const { service } = setup();
    const web = await service.resolve(
      owner,
      { previewSessionId: sessionId, previewChannel: 'web' },
      true,
    );

    const telegram = await service.resolve(
      owner,
      { previewSessionId: sessionId, previewChannel: 'telegram' },
      true,
    );

    const whatsapp = await service.resolve(
      owner,
      { previewSessionId: sessionId, previewChannel: 'whatsapp' },
      true,
    );

    expect(new Set([owner.id, web.id, telegram.id, whatsapp.id]).size).toBe(4);
  });

  it('keeps another authenticated developer out of an existing sandbox', async () => {
    const { service } = setup();
    await service.resolve(
      owner,
      { previewSessionId: sessionId, previewChannel: 'web' },
      true,
    );
    await expect(
      service.resolve(
        { ...owner, id: 'other-developer' },
        { previewSessionId: sessionId, previewChannel: 'web' },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('starts a fresh data owner for a new session', async () => {
    const { service } = setup();
    const first = await service.resolve(
      owner,
      { previewSessionId: sessionId, previewChannel: 'web' },
      true,
    );

    const second = await service.resolve(
      owner,
      {
        previewSessionId: '22222222-2222-4222-8222-222222222222',
        previewChannel: 'web',
      },
      true,
    );

    expect(second.id).not.toBe(first.id);
  });

  it('reuses the sandbox on repeated or concurrent requests', async () => {
    const { service, users } = setup();
    const scope = {
      previewSessionId: sessionId,
      previewChannel: 'web' as const,
    };

    const [first, second] = await Promise.all([
      service.resolve(owner, scope, true),
      service.resolve(owner, scope, true),
    ]);

    expect(first.id).toBe(second.id);
    expect(users.size).toBe(2);
  });

  it('copies the profile without changing the original user', async () => {
    const { service, users } = setup();
    const sandbox = await service.resolve(
      owner,
      { previewSessionId: sessionId, previewChannel: 'telegram' },
      true,
    );

    expect(sandbox).toMatchObject({
      name: 'Developer',
      timezone: 'Asia/Makassar',
      locale: 'en',
      persona: 'friendly',
      preferredAddress: 'Dev',
    });
    expect(users.get(owner.id)).toEqual(owner);
  });

  it('disables sandbox sign-in and background notification delivery', async () => {
    const { service, users, preferences } = setup();
    const sandbox = await service.resolve(
      owner,
      { previewSessionId: sessionId, previewChannel: 'web' },
      true,
    );

    expect(users.get(sandbox.id)).toMatchObject({
      banned: true,
      automaticMemoryEnabled: false,
    });
    expect(preferences.get(sandbox.id)).toEqual({
      userId: sandbox.id,
      briefingEnabled: false,
      webNotificationsEnabled: false,
      telegramNotificationsEnabled: false,
      whatsappNotificationsEnabled: false,
    });
  });

  it('rejects preview options in production before creating data', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const { service, users } = setup('production');
    await expect(
      service.resolve(
        owner,
        { previewSessionId: sessionId, previewChannel: 'web' },
        true,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(users.size).toBe(1);
    expect(warn).toHaveBeenCalledWith(
      'Rejected chat preview options outside development',
    );
    warn.mockRestore();
  });

  it('rejects preview options when the environment is not explicitly development', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const { service } = setup('test');
    await expect(
      service.resolve(
        owner,
        { previewSessionId: sessionId, previewChannel: 'web' },
        true,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    warn.mockRestore();
  });

  it('rejects an incomplete scope instead of silently using real data', async () => {
    const { service, users } = setup();
    await expect(
      service.resolve(owner, { previewSessionId: sessionId }, true),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(users.size).toBe(1);
  });

  it('does not create a missing sandbox during a detail read', async () => {
    const { service, users } = setup();
    await expect(
      service.resolve(owner, {
        previewSessionId: sessionId,
        previewChannel: 'web',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(users.size).toBe(1);
  });
});
