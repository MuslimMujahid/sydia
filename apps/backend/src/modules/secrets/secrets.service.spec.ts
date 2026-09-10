import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type {
  IAuditEventRepository,
  IConversationRepository,
  ISecretRepository,
} from '../../database/interfaces';
import type { SecretCipher } from '../../infra/crypto';
import { SecretsService } from './secrets.service';

function createService(source: string | null) {
  const maskUserMessage = jest.fn<
    (userId: string, messageId: string, replacement: string) => Promise<boolean>
  >(() => Promise.resolve(true));

  const maskActiveChannelTurns = jest.fn<
    (userId: string, messageId: string, replacement: string) => Promise<void>
  >(() => Promise.resolve());

  const create = jest.fn<
    (
      userId: string,
      input: { label: string; encryptedValue: string },
    ) => Promise<{
      id: string;
      label: string;
      createdAt: Date;
      updatedAt: Date;
      lastRevealedAt: Date | null;
      revealCount: number;
    }>
  >(() =>
    Promise.resolve({
      id: 'secret-1',
      label: 'Facebook account',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastRevealedAt: null,
      revealCount: 0,
    }),
  );

  const secrets = {
    create,
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

  return { service, create, maskUserMessage, maskActiveChannelTurns, cipher };
}

describe('SecretsService', () => {
  it('accepts LLM-provided structured input regardless of source wording', async () => {
    const source =
      'I was discussing recipes, not secret storage: foo@example.com\nPass-9274';

    const { service, create, cipher, maskUserMessage, maskActiveChannelTurns } =
      createService(source);

    const value = 'foo@example.com\nPass-9274';

    await service.createFromChat('user-1', 'message-1', {
      label: 'Facebook account',
      value,
    });

    expect(cipher.encrypt).toHaveBeenCalledWith(value);
    expect(create).toHaveBeenCalledWith('user-1', {
      label: 'Facebook account',
      encryptedValue: 'encrypted',
    });

    const masked = 'I was discussing recipes, not secret storage: ****';
    expect(maskUserMessage).toHaveBeenCalledWith('user-1', 'message-1', masked);
    expect(maskActiveChannelTurns).toHaveBeenCalledWith(
      'user-1',
      'message-1',
      masked,
    );
  });

  it('masks the exact multiline value without splitting fields', async () => {
    const value = 'foo@example.com\nPass-9274';
    const source = `Unrelated wording:\n${value}\nKeep this context.`;
    const { service, maskUserMessage } = createService(source);

    await service.createFromChat('user-1', 'message-1', {
      label: 'Facebook account',
      value,
    });

    expect(maskUserMessage).toHaveBeenCalledWith(
      'user-1',
      'message-1',
      'Unrelated wording:\n****\nKeep this context.',
    );
  });

  it('creates the secret when the source message is unavailable', async () => {
    const { service, create, maskUserMessage, maskActiveChannelTurns } =
      createService(null);

    await service.createFromChat('user-1', 'missing-message', {
      label: 'Facebook account',
      value: 'foo@example.com\nPass-9274',
    });

    expect(create).toHaveBeenCalledWith('user-1', {
      label: 'Facebook account',
      encryptedValue: 'encrypted',
    });
    expect(maskUserMessage).not.toHaveBeenCalled();
    expect(maskActiveChannelTurns).not.toHaveBeenCalled();
  });
});
