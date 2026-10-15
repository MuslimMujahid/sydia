import { expect, jest, test } from '@jest/globals';
import type { PrismaService } from '../../infra/prisma';
import { PrismaNotificationRepository } from './prisma-notification.repository';

function setup(count: number) {
  const updateMany = jest
    .fn<(input: unknown) => Promise<{ count: number }>>()
    .mockResolvedValue({ count });

  const pending = {
    id: 'delivery-1',
    status: 'pending',
    content: 'Current reminder',
  };

  const findUnique = jest
    .fn<() => Promise<typeof pending>>()
    .mockResolvedValue(pending);

  const repository = new PrismaNotificationRepository({
    notificationDelivery: { updateMany, findUnique },
  } as unknown as PrismaService);

  return { repository, updateMany, findUnique };
}

test('a suppressed event reminder can be rearmed for its updated schedule', async () => {
  const { repository, updateMany } = setup(1);
  expect(
    await repository.rearmEventReminder(
      'user-1',
      'delivery-1',
      'Current reminder',
    ),
  ).toMatchObject({ status: 'pending', content: 'Current reminder' });
  expect(updateMany).toHaveBeenCalledWith({
    where: {
      id: 'delivery-1',
      userId: 'user-1',
      kind: 'event_reminder',
      status: 'skipped_obsolete',
    },
    data: {
      status: 'pending',
      content: 'Current reminder',
      policyOutcome: null,
    },
  });
});

test('rearming cannot overwrite a reminder already claimed or delivered', async () => {
  const { repository, findUnique } = setup(0);
  expect(
    await repository.rearmEventReminder(
      'user-1',
      'delivery-1',
      'Current reminder',
    ),
  ).toBeNull();
  expect(findUnique).not.toHaveBeenCalled();
});
