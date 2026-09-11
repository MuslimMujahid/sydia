import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { IWhatsAppRepository } from '../../database/interfaces';
import { WhatsAppGatewayService } from './whatsapp.gateway';
import type {
  NormalizedInboundMessage,
  WhatsAppClient,
  WhatsAppClientFactory,
} from './whatsapp.types';

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    BACKEND_WHATSAPP_GOWA_URL: 'http://127.0.0.1:3001',
    BACKEND_WHATSAPP_GOWA_DEVICE_ID: 'sydia',
    BACKEND_WHATSAPP_COMMAND_TIMEOUT: 1_000,
    BACKEND_WHATSAPP_LOCK_PATH: '.data/whatsapp',
    BACKEND_WHATSAPP_STATUS_POLL_MS: 60_000,
    BACKEND_WHATSAPP_RUNTIME_ENABLED: true,
    ...overrides,
  };

  return {
    get: jest.fn((key: string, fallback?: unknown) =>
      key in values ? values[key] : fallback,
    ),
  } as unknown as ConfigService;
}

function makeClient(overrides: Partial<WhatsAppClient> = {}): WhatsAppClient {
  return {
    ensureDevice: jest.fn(() => undefined),
    status: jest.fn(() => ({
      device_id: 'sydia',
      is_connected: false,
      is_logged_in: false,
      jid: '',
    })),
    pairCode: jest.fn(() => 'ABCD-EFGH'),
    logout: jest.fn(() => undefined),
    reconnect: jest.fn(() => undefined),
    sendText: jest.fn(() => ({ message_id: 'm1', status: 'sent' })),
    markRead: jest.fn(() => undefined),
    sendChatPresence: jest.fn(() => undefined),
    downloadMedia: jest.fn(() => ({
      message_id: 'm1',
      status: 'success',
      media_type: 'image',
      filename: 'x.jpeg',
      file_path: 'statics/media/x.jpeg',
      file_size: 0,
    })),
    ...overrides,
  } as unknown as WhatsAppClient;
}

function makeRepository(): IWhatsAppRepository {
  return {
    getGatewayState: jest.fn(() => null),
    updateGatewayState: jest.fn(() => ({})),
  } as unknown as IWhatsAppRepository;
}

describe('WhatsApp gateway runtime flag', () => {
  it('does not load state or create a client when runtime is disabled', async () => {
    const config = makeConfig({ BACKEND_WHATSAPP_RUNTIME_ENABLED: false });
    const getGatewayState = jest.fn(() => null);
    const repository = {
      getGatewayState,
    } as unknown as IWhatsAppRepository;

    const factory = jest.fn<WhatsAppClientFactory>();
    const gateway = new WhatsAppGatewayService(config, repository, factory);

    await gateway.onModuleInit();

    expect(getGatewayState).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
    expect(gateway.getClient()).toBeNull();
  });

  it('allows only one process-local owner for a companion lock', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sydia-whatsapp-lock-'));
    const lockPath = join(directory, 'session');
    const config = makeConfig({ BACKEND_WHATSAPP_LOCK_PATH: lockPath });
    const repository = makeRepository();
    const client = makeClient();
    const first = new WhatsAppGatewayService(config, repository, () => client);
    const second = new WhatsAppGatewayService(config, repository, () => client);

    try {
      await first.onModuleInit();
      await second.onModuleInit();

      expect(first.getClient()).toBe(client);
      expect(second.getClient()).toBeNull();
    } finally {
      await first.onModuleDestroy();
      await second.onModuleDestroy();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('creates missing parent directories for a companion lock', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sydia-whatsapp-lock-'));
    const lockPath = join(directory, 'nested', 'session');
    const config = makeConfig({ BACKEND_WHATSAPP_LOCK_PATH: lockPath });
    const repository = makeRepository();
    const gateway = new WhatsAppGatewayService(config, repository, () =>
      makeClient(),
    );

    try {
      await gateway.onModuleInit();

      expect(gateway.getClient()).not.toBeNull();
    } finally {
      await gateway.onModuleDestroy();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('marks the gateway connected when the companion reports logged in', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sydia-whatsapp-lock-'));
    const config = makeConfig({
      BACKEND_WHATSAPP_LOCK_PATH: join(directory, 'session'),
    });

    const repository = makeRepository();
    const client = makeClient({
      status: jest.fn<WhatsAppClient['status']>().mockResolvedValue({
        device_id: 'sydia',
        is_connected: true,
        is_logged_in: true,
        jid: '62812@s.whatsapp.net',
      }),
    });

    const gateway = new WhatsAppGatewayService(
      config,
      repository,
      () => client,
    );

    try {
      await gateway.onModuleInit();
      expect(gateway.getStatus().status).toBe('connected');
      expect(gateway.getJid()).toBe('62812@s.whatsapp.net');
    } finally {
      await gateway.onModuleDestroy();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('requests a pairing code and enters awaiting_pair', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sydia-whatsapp-lock-'));
    const config = makeConfig({
      BACKEND_WHATSAPP_LOCK_PATH: join(directory, 'session'),
    });

    const repository = makeRepository();
    const pairCode = jest
      .fn<WhatsAppClient['pairCode']>()
      .mockResolvedValue('ABCD-EFGH');

    const client = makeClient({ pairCode });
    const gateway = new WhatsAppGatewayService(
      config,
      repository,
      () => client,
    );

    try {
      await gateway.onModuleInit();
      await expect(gateway.requestPairCode('6285169319118')).resolves.toBe(
        'ABCD-EFGH',
      );
      expect(pairCode).toHaveBeenCalledWith('6285169319118');
      expect(gateway.getStatus().status).toBe('awaiting_pair');
    } finally {
      await gateway.onModuleDestroy();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('routes webhook messages and receipts to listeners', () => {
    const config = makeConfig();
    const repository = makeRepository();
    const client = makeClient();
    const gateway = new WhatsAppGatewayService(
      config,
      repository,
      () => client,
    );

    const inbound = jest.fn<(message: NormalizedInboundMessage) => void>();
    const receipt =
      jest.fn<
        (input: {
          type: string;
          chat: string;
          sender: string;
          isGroup: boolean;
          ids: string[];
          timestamp: number;
        }) => void
      >();

    gateway.on('inbound', inbound);
    gateway.on('receipt', receipt);

    gateway.handleWebhook({
      event: 'message',
      payload: {
        id: 'm1',
        chat_id: '62812@s.whatsapp.net',
        from: '62812@s.whatsapp.net',
        body: 'hi',
      },
    });
    gateway.handleWebhook({
      event: 'message.ack',
      payload: {
        ids: ['m1'],
        chat_id: '62812@s.whatsapp.net',
        from: '62812@s.whatsapp.net',
        receipt_type: 'read',
      },
    });

    expect(inbound).toHaveBeenCalledTimes(1);
    expect(inbound.mock.calls[0]?.[0]?.providerMessageId).toBe('m1');
    expect(receipt).toHaveBeenCalledTimes(1);
    expect(receipt.mock.calls[0]?.[0]?.type).toBe('read');
  });
});
