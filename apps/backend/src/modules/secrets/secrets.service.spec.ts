import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type {
  IAuditEventRepository,
  IConversationRepository,
  ISecretRepository,
} from '../../database/interfaces';
import type { SecretCipher } from '../../infra/crypto';
import { SecretsService } from './secrets.service';

function createService(source: string) {
  const maskUserMessage = jest.fn<
    (userId: string, messageId: string, replacement: string) => Promise<boolean>
  >(() => Promise.resolve(true));

  const maskActiveChannelTurns = jest.fn<
    (userId: string, messageId: string, replacement: string) => Promise<void>
  >(() => Promise.resolve());

  const secrets = {
    create: jest.fn(() =>
      Promise.resolve({
        id: 'secret-1',
        label: 'Facebook account',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastRevealedAt: null,
        revealCount: 0,
      }),
    ),
  } as unknown as ISecretRepository;

  const conversations = {
    findUserMessageContent: jest.fn(() => Promise.resolve(source)),
    maskUserMessage,
    maskActiveChannelTurns,
  } as unknown as IConversationRepository;

  const audit = {
    record: jest.fn(() => Promise.resolve()),
  } as unknown as IAuditEventRepository;

  const cipher = {
    encrypt: jest.fn(() => 'encrypted'),
  } as unknown as SecretCipher;

  const service = new SecretsService(
    secrets,
    conversations,
    audit,
    cipher,
    new ConfigService({ FRONTEND_URL: 'http://localhost:3000' }),
  );

  return { service, maskUserMessage, maskActiveChannelTurns };
}

describe('SecretsService', () => {
  it('preserves the original message while masking every compact value', async () => {
    const { service, maskUserMessage, maskActiveChannelTurns } = createService(
      'Tolong simpan username foo@example.com dan password Pass-9274 untuk Facebook',
    );

    await service.createFromChat('user-1', 'message-1', {
      label: 'Facebook account',
      value: 'USERNAME:<foo@example.com> | PASSWORD:<Pass-9274>',
    });

    const masked =
      'Tolong simpan username **** dan password **** untuk Facebook';

    expect(maskUserMessage).toHaveBeenCalledWith('user-1', 'message-1', masked);
    expect(maskActiveChannelTurns).toHaveBeenCalledWith(
      'user-1',
      'message-1',
      masked,
    );
  });

  it('does not store when save intent is absent', async () => {
    const { service } = createService(
      'Username Facebook saya foo@example.com dan password Pass-9274',
    );

    await expect(
      service.createFromChat('user-1', 'message-1', {
        label: 'Facebook account',
        value: 'USERNAME:<foo@example.com> | PASSWORD:<Pass-9274>',
      }),
    ).rejects.toThrow('Instruksi eksplisit');
  });
});
