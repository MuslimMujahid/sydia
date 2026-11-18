import { describe, expect, jest, test } from '@jest/globals';
import type { User } from '../../../database/entities';
import type {
  IAuditEventRepository,
  IUserRepository,
} from '../../../database/interfaces';
import { ErrorCodes } from '../../../shared/errors';
import { UpdateUserProfileService } from '../../users/user-profile.module';
import { createTimezoneTool } from './timezone-tool';

const owner: User = {
  id: 'chat-owner',
  name: 'Dewi',
  email: 'dewi@example.test',
  emailVerified: true,
  image: null,
  role: 'user',
  timezone: 'Asia/Jakarta',
  locale: 'id',
  onboardingCompleted: true,
  automaticMemoryEnabled: true,
  persona: 'professional',
  preferredAddress: null,
  occupation: null,
  createdAt: new Date('2026-08-01T00:00:00Z'),
  updatedAt: new Date('2026-08-01T00:00:00Z'),
};

function setup(user: User | null) {
  const users: IUserRepository = {
    findById: () => Promise.resolve(user),
    updateProfile: jest.fn<IUserRepository['updateProfile']>((id, update) =>
      Promise.resolve(user?.id === id ? { ...user, ...update } : null),
    ),
  };

  const record = jest
    .fn<IAuditEventRepository['record']>()
    .mockResolvedValue(undefined);

  const tool = createTimezoneTool(
    new UpdateUserProfileService(users, { record }),
  );

  return { tool, users, record };
}

function invoke(tool: ReturnType<typeof createTimezoneTool>, timezone: string) {
  return tool.execute({
    userId: owner.id,
    sourceMessageId: 'message-1',
    idempotencyKey: 'message-1:timezone',
    arguments: tool.parseArguments({ timezone }),
  });
}

describe('set_timezone', () => {
  test('updates only the authenticated user’s profile timezone and returns the saved zone', async () => {
    const { tool, users } = setup(owner);

    await expect(invoke(tool, ' Asia/Singapore ')).resolves.toEqual({
      timezone: 'Asia/Singapore',
    });
    expect(users.updateProfile).toHaveBeenCalledWith(owner.id, {
      timezone: 'Asia/Singapore',
    });
  });

  test('audits the timezone change as a profile update', async () => {
    const { tool, record } = setup(owner);

    await invoke(tool, 'UTC');

    expect(record).toHaveBeenCalledWith({
      userId: owner.id,
      eventType: 'user.profile.updated',
      metadata: { changedFields: ['timezone'] },
    });
  });

  test.each(['Asia/Nowhere', 'PST', '+07:00', ' ', 7, undefined])(
    'rejects unusable or ambiguous timezone input %p',
    (timezone) => {
      const { tool } = setup(owner);

      expect(() => tool.parseArguments({ timezone })).toThrow(
        expect.objectContaining({ code: ErrorCodes.BAD_REQUEST }),
      );
    },
  );

  test('reports a missing profile instead of confirming a change', async () => {
    const { tool } = setup(null);

    await expect(invoke(tool, 'Asia/Singapore')).rejects.toMatchObject({
      code: ErrorCodes.NOT_FOUND,
    });
  });
});
