import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { DocumentService } from '../documents/document.service';
import type { OpenRouterMediaService } from '../../infra/model-gateway';
import type { WhatsAppConnectionsGateway } from '../../infra/whatsapp/whatsapp-connections.gateway';
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
};

async function setup(): Promise<Setup> {
  let adapter: ChannelTurnAdapter | undefined;
  const gateway = {
    registerInbound: jest.fn(),
    registerReceipt: jest.fn(),
    registerRecovered: jest.fn(),
    download: jest.fn(() => Promise.resolve(Buffer.from('image'))),
  } as unknown as WhatsAppConnectionsGateway;

  const messages = {
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
      findActive: () =>
        Promise.resolve({
          id: 'connection-1',
          generation: 1,
          ownerVerifiedAt: new Date('2026-09-10T12:00:00Z'),
          ownerExternalId: '628123',
        }),
    } as never,
    {} as never,
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
  };
}

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
