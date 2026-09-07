import { describe, expect, jest, test } from '@jest/globals';
import type { PrismaService } from '../../infra/prisma';
import { PrismaUserPrivacyRepository } from './prisma-user-privacy.repository';

function mockUser() {
  return {
    id: 'user-1',
    name: 'Ada',
    email: 'ada@example.com',
    externalIdentities: [
      {
        id: 'identity-1',
        userId: 'user-1',
        provider: 'whatsapp',
        externalId: '628123',
        verifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        whatsappState: {
          id: 'state-1',
          externalIdentityId: 'identity-1',
          optedOutAt: null,
          unansweredProactiveCount: 0,
        },
        inboundMessages: [
          {
            id: 'inbound-1',
            provider: 'whatsapp',
            providerMessageId: 'wamid-1',
            senderExternalId: '628123',
            externalIdentityId: 'identity-1',
            receivedAt: new Date(),
            processedAt: new Date(),
            createdAt: new Date(),
          },
        ],
      },
    ],
    notificationDeliveries: [
      {
        id: 'delivery-1',
        userId: 'user-1',
        kind: 'whatsapp',
        content: 'Your reminder',
        idempotencyKey: 'delivery-key',
        proactive: true,
        attempts: [
          {
            id: 'attempt-1',
            deliveryId: 'delivery-1',
            attemptNumber: 1,
            status: 'delivered',
          },
        ],
      },
    ],
    auditEvents: [
      {
        id: 'audit-1',
        userId: 'user-1',
        eventType: 'whatsapp.identity.linked',
        metadata: { externalId: '628123' },
        createdAt: new Date(),
      },
    ],
  };
}

describe('PrismaUserPrivacyRepository exportData', () => {
  test('uses an allow-list for portable user-owned state without credentials', async () => {
    const findUnique = jest.fn<(input: unknown) => Promise<unknown>>(() =>
      Promise.resolve(mockUser()),
    );

    const repository = new PrismaUserPrivacyRepository({
      user: { findUnique },
    } as unknown as PrismaService);

    const exported = await repository.exportData('user-1');
    const firstCall = findUnique.mock.calls[0];
    expect(firstCall).toBeDefined();
    const callInput = firstCall?.[0];

    if (
      !callInput ||
      typeof callInput !== 'object' ||
      !('select' in callInput)
    ) {
      throw new Error('Expected Prisma select input');
    }

    const select =
      callInput.select as typeof import('../interfaces').USER_EXPORT_SELECT;

    expect(exported?.user.externalIdentities).toHaveLength(1);
    expect(exported?.user.externalIdentities[0]?.whatsappState).toEqual(
      expect.objectContaining({ optedOutAt: null }),
    );
    expect(exported?.user.externalIdentities[0]?.inboundMessages).toHaveLength(
      1,
    );
    expect(exported?.user.notificationDeliveries[0]?.attempts).toHaveLength(1);
    expect(exported?.user.auditEvents).toHaveLength(1);

    expect(select.externalIdentities.select.whatsappState.select).toEqual(
      expect.objectContaining({ unansweredProactiveCount: true }),
    );
    expect(select.notificationDeliveries.select.attempts.select).toEqual(
      expect.objectContaining({ errorMessage: true }),
    );
    expect(select).not.toHaveProperty('accounts');
    expect(select).not.toHaveProperty('sessions');
    expect(select).not.toHaveProperty('whatsappLinkCodes');
    expect(select).not.toHaveProperty('fileAssets');
    expect(select.calendarIntegrations.select).not.toHaveProperty(
      'accessToken',
    );
    expect(select.calendarIntegrations.select).not.toHaveProperty(
      'refreshToken',
    );
  });

  test('returns null for an unknown user', async () => {
    const findUnique = jest.fn<(input: unknown) => Promise<unknown>>(() =>
      Promise.resolve(null),
    );

    const repository = new PrismaUserPrivacyRepository({
      user: { findUnique },
    } as unknown as PrismaService);

    await expect(repository.exportData('missing-user')).resolves.toBeNull();
  });
});
