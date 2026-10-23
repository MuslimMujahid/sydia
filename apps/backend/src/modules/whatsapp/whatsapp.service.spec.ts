import { afterEach, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DocumentService } from '../documents/document.service';
import type { OpenRouterMediaService } from '../../infra/model-gateway';
import type {
  WhatsAppConnectionsGateway,
  ConnectionClient,
  ScopedInboundHandler,
} from '../../infra/whatsapp/whatsapp-connections.gateway';
import type {
  WhatsAppConnection,
  WhatsAppConnectionScope,
} from '../../database/entities';
import type { NormalizedInboundMessage } from '../../shared/messaging';
import type { ChannelTurnAdapter, MessagingHandlerService } from '../messaging';
import { WhatsAppService } from './whatsapp.service';

const message: NormalizedInboundMessage = {
  provider: 'whatsapp',
  whatsappConnection: { id: 'connection-1', generation: 1 },
  providerMessageId: 'wamid-42',
  senderExternalId: '628123',
  chatExternalId: '628123',
  isGroup: false,
  isFromMe: false,
  receivedAt: new Date('2026-09-10T12:00:00.000Z'),
  text: '',
  kind: 'image',
  mediaMessage: { mimetype: 'image/jpeg' },
  raw: {},
};

type Setup = {
  adapter: () => ChannelTurnAdapter;
  documents: { ingest: jest.Mock; waitUntilReady: jest.Mock };
  service: WhatsAppService;
  client: {
    markRead: jest.Mock<ConnectionClient['markRead']>;
    sendChatPresence: jest.Mock<ConnectionClient['sendChatPresence']>;
  };
  inbound: (value: NormalizedInboundMessage) => Promise<void>;
  recordInbound: jest.Mock<() => Promise<string | null>>;
  handle: jest.Mock<() => Promise<boolean>>;
};

async function setup(): Promise<Setup> {
  let adapter: ChannelTurnAdapter | undefined;
  let inbound: ScopedInboundHandler | undefined;
  const connection = {
    id: 'connection-1',
    generation: 1,
    userId: 'user-1',
    ownerVerifiedAt: new Date('2026-09-10T12:00:00Z'),
    ownerExternalId: '628123',
    ownerIdentityId: 'identity-1',
  } as WhatsAppConnection;

  const client = {
    markRead: jest
      .fn<ConnectionClient['markRead']>()
      .mockResolvedValue(undefined),
    sendChatPresence: jest
      .fn<ConnectionClient['sendChatPresence']>()
      .mockResolvedValue(undefined),
  };

  const recordInbound = jest
    .fn<() => Promise<string | null>>()
    .mockResolvedValue('inbound-1');

  const handle = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const gateway = {
    registerInbound: (handler: ScopedInboundHandler) => {
      inbound = handler;
    },
    registerReceipt: jest.fn(),
    registerRecovered: jest.fn(),
    download: jest.fn(() => Promise.resolve(Buffer.from('image'))),
    send: (
      _scope: WhatsAppConnectionScope,
      operation: (
        client: ConnectionClient,
        connection: WhatsAppConnection,
      ) => Promise<unknown>,
    ) => operation(client as unknown as ConnectionClient, connection),
  } as unknown as WhatsAppConnectionsGateway;

  const messages = {
    handle,
    registerAdapter: jest.fn((_provider: string, value: ChannelTurnAdapter) => {
      adapter = value;

      return Promise.resolve();
    }),
  } as unknown as MessagingHandlerService;

  const documents = {
    ingest: jest.fn(() =>
      Promise.resolve({ id: 'document-1', file: { id: 'asset-1' } }),
    ),
    waitUntilReady: jest.fn(() => Promise.resolve({ imageDescription: null })),
  };

  const service = new WhatsAppService(
    gateway,
    {
      recordInbound,
      finishInbound: () => Promise.resolve(),
      findActive: () =>
        Promise.resolve({
          id: 'connection-1',
          generation: 1,
          ownerVerifiedAt: new Date('2026-09-10T12:00:00Z'),
          ownerExternalId: '628123',
        }),
    } as never,
    {
      findById: () => Promise.resolve({ id: 'user-1', emailVerified: true }),
    } as never,
    {} as never,
    {} as never,
    messages,
    documents as unknown as DocumentService,
    {} as OpenRouterMediaService,
    () => new Date('2026-09-10T12:00:00.000Z'),
    {} as never,
    new ConfigService({ BACKEND_AUTH_SECRET: 'whatsapp-unit-test-secret' }),
  );

  await service.onModuleInit();

  return {
    adapter: () => {
      if (!adapter) throw new Error('WhatsApp adapter was not registered');

      return adapter;
    },
    documents,
    service,
    client,
    recordInbound,
    handle,
    inbound: (value) => {
      if (!inbound)
        throw new Error('WhatsApp inbound handler was not registered');

      return inbound(connection, value);
    },
  };
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('WhatsApp read acknowledgements', () => {
  it('marks an accepted owner message read before processing it', async () => {
    const { inbound, client, handle } = await setup();
    handle.mockImplementation(() => {
      expect(client.markRead).toHaveBeenCalledWith('628123', 'wamid-42');

      return Promise.resolve(true);
    });
    await inbound(message);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('does not acknowledge a duplicate webhook', async () => {
    const { inbound, client, recordInbound } = await setup();
    recordInbound.mockResolvedValue(null);
    await inbound(message);
    expect(client.markRead).not.toHaveBeenCalled();
  });

  it('rejects non-owner messages without acknowledging them', async () => {
    const { inbound, client } = await setup();
    await expect(
      inbound({ ...message, senderExternalId: 'stranger' }),
    ).rejects.toThrow('no longer authorized');
    expect(client.markRead).not.toHaveBeenCalled();
  });

  it('logs receipt failure and still processes the message', async () => {
    const { inbound, client, handle } = await setup();
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    client.markRead.mockRejectedValue(new Error('provider offline'));
    await inbound(message);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('read acknowledgement failed'),
      expect.any(Error),
    );
  });
});

describe('WhatsApp typing lifecycle', () => {
  it('waits for an in-flight refresh before pausing typing', async () => {
    jest.useFakeTimers();
    const { adapter, client } = await setup();
    const stop = await adapter().beginProcessing!(
      [message],
      new AbortController().signal,
    );

    let finishRefresh!: () => void;
    client.sendChatPresence.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    await jest.advanceTimersByTimeAsync(4_000);
    const stopping = stop();
    expect(client.sendChatPresence).not.toHaveBeenCalledWith(
      '628123',
      'paused',
    );
    finishRefresh();
    await stopping;
    expect(client.sendChatPresence).toHaveBeenLastCalledWith(
      '628123',
      'paused',
    );
  });

  it('starts typing and refreshes it while processing', async () => {
    jest.useFakeTimers();
    const { adapter, client } = await setup();
    const stop = await adapter().beginProcessing!(
      [message],
      new AbortController().signal,
    );

    expect(client.sendChatPresence).toHaveBeenCalledWith('628123', 'composing');
    await jest.advanceTimersByTimeAsync(4_000);
    expect(client.sendChatPresence).toHaveBeenCalledTimes(2);
    await stop();
  });

  it('pauses typing on completion and cancels refresh', async () => {
    jest.useFakeTimers();
    const { adapter, client } = await setup();
    const stop = await adapter().beginProcessing!(
      [message],
      new AbortController().signal,
    );

    await stop();
    await stop();
    await jest.advanceTimersByTimeAsync(8_000);
    expect(client.sendChatPresence.mock.calls).toEqual([
      ['628123', 'composing'],
      ['628123', 'paused'],
    ]);
  });

  it('pauses typing when processing is cancelled', async () => {
    jest.useFakeTimers();
    const { adapter, client } = await setup();
    const controller = new AbortController();
    const stop = await adapter().beginProcessing!([message], controller.signal);
    controller.abort();
    await stop();
    await jest.advanceTimersByTimeAsync(8_000);
    expect(client.sendChatPresence.mock.calls).toEqual([
      ['628123', 'composing'],
      ['628123', 'paused'],
    ]);
  });

  it('does not send typing for an already cancelled turn', async () => {
    const { adapter, client } = await setup();
    const controller = new AbortController();
    controller.abort();
    const stop = await adapter().beginProcessing!([message], controller.signal);
    await stop();
    expect(client.sendChatPresence).not.toHaveBeenCalled();
  });

  it('stops refreshing after a provider failure and logs degraded feedback', async () => {
    jest.useFakeTimers();
    const { adapter, client } = await setup();
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    client.sendChatPresence.mockRejectedValue(new Error('provider offline'));
    const stop = await adapter().beginProcessing!(
      [message],
      new AbortController().signal,
    );

    await jest.advanceTimersByTimeAsync(12_000);
    expect(client.sendChatPresence).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('disabling refresh'),
      expect.any(Error),
    );
    await stop();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('typing stop failed'),
      expect.any(Error),
    );
  });
});

describe('WhatsAppService media names', () => {
  it('uses provider-id fallback and passes a usable hint', async () => {
    const { adapter, documents } = await setup();

    await adapter().prepare('user-1', { ...message, text: 'Receipt' });

    expect(documents.ingest).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ originalname: 'wamid-42.bin' }),
      { hint: 'Receipt' },
    );
  });

  it('uses supplied filenames and omits absent hints', async () => {
    const { adapter, documents } = await setup();

    await adapter().prepare('user-1', {
      ...message,
      mediaMessage: {
        mimetype: 'image/jpeg',
        fileName: 'Rencana.png',
      },
    });

    expect(documents.ingest).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ originalname: 'Rencana.png' }),
    );
  });
});
