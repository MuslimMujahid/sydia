import 'dotenv/config';
import { jest } from '@jest/globals';
import {
  WhatsAppConnectionsGateway,
  type ConnectionClient,
} from '../../src/infra/whatsapp/whatsapp-connections.gateway';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/infra/prisma';
import { PrismaWhatsAppConnectionRepository } from '../../src/database/repositories';
import {
  WhatsAppConnectionConflict,
  WhatsAppConnectionRevoked,
} from '../../src/database/entities';

const enabled = process.env.WHATSAPP_CONTRACT_ENABLED === 'true';
const now = new Date('2026-10-22T06:00:00Z');
const expiresAt = new Date('2026-10-22T06:10:00Z');

(enabled ? describe : describe.skip)(
  'WhatsApp connection PostgreSQL contract',
  () => {
    const prisma = new PrismaService(new ConfigService(process.env));
    const independentPrisma = new PrismaService(new ConfigService(process.env));
    const repository = new PrismaWhatsAppConnectionRepository(prisma);
    const independent = new PrismaWhatsAppConnectionRepository(
      independentPrisma,
    );

    let owner: string;
    let other: string;

    beforeEach(async () => {
      owner = `whatsapp-contract-${randomUUID()}`;
      other = `whatsapp-contract-${randomUUID()}`;
      await prisma.user.createMany({
        data: [
          {
            id: owner,
            name: 'WhatsApp contract owner',
            email: `${owner}@example.test`,
            emailVerified: true,
          },
          {
            id: other,
            name: 'WhatsApp contract other',
            email: `${other}@example.test`,
            emailVerified: true,
          },
        ],
      });
    });
    afterEach(async () => {
      jest.restoreAllMocks();
      await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } });
    });
    afterAll(async () => {
      await Promise.all([
        prisma.onModuleDestroy(),
        independentPrisma.onModuleDestroy(),
      ]);
    });

    async function paired(userId: string, assistant: string) {
      const connection = await repository.create(userId, randomUUID());
      const result = await repository.confirmAssistant(
        connection,
        assistant,
        now,
      );

      if (!result) throw new Error('Contract setup failed to pair assistant.');

      return result;
    }

    test('provider confirmation after QR expiry cannot activate the assistant', async () => {
      const connection = await repository.create(owner, randomUUID());
      await repository.setQr(
        connection,
        'expired-attempt',
        Buffer.from([1]),
        new Date('2026-10-22T05:59:59Z'),
      );

      expect(
        await repository.confirmAssistant(
          connection,
          'expired@s.whatsapp.net',
          now,
        ),
      ).toBeNull();
      expect(await repository.findActive(owner)).toMatchObject({
        assistantExternalId: null,
      });
    });

    test('an active user cannot acquire a second device', async () => {
      await repository.create(owner, randomUUID());
      await expect(
        independent.create(owner, randomUUID()),
      ).rejects.toBeInstanceOf(WhatsAppConnectionConflict);
    });

    test('another user cannot claim a paired assistant account', async () => {
      await paired(owner, 'assistant@s.whatsapp.net');
      const second = await repository.create(other, randomUUID());
      await expect(
        independent.confirmAssistant(second, 'assistant@s.whatsapp.net', now),
      ).rejects.toBeInstanceOf(WhatsAppConnectionConflict);
      expect((await repository.findActive(owner))?.active).toBe(true);
    });

    test('pairing alone does not verify the owner', async () => {
      const connection = await paired(owner, 'assistant@s.whatsapp.net');
      expect(connection).toMatchObject({
        setupPhase: 'owner_verification',
        ownerVerifiedAt: null,
        ownerExternalId: null,
      });
    });

    test('owner verification consumes the challenge once across concurrent clients', async () => {
      const connection = await paired(owner, 'assistant@s.whatsapp.net');
      await repository.issueOwnerCode(connection, 'owner-hash', expiresAt);
      const results = await Promise.all([
        repository.verifyOwner(
          connection,
          'owner-hash',
          'owner@s.whatsapp.net',
          now,
        ),
        independent.verifyOwner(
          connection,
          'owner-hash',
          'owner@s.whatsapp.net',
          now,
        ),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await repository.findActive(owner)).toMatchObject({
        setupPhase: 'ready',
        ownerExternalId: 'owner@s.whatsapp.net',
        ownerCodeHash: null,
      });
    });

    test('a challenge sent to the wrong receiving device cannot link its sender', async () => {
      const connection = await paired(owner, 'assistant@s.whatsapp.net');
      const wrong = await paired(other, 'other-assistant@s.whatsapp.net');
      await repository.issueOwnerCode(connection, 'owner-hash', expiresAt);
      expect(
        await independent.verifyOwner(
          wrong,
          'owner-hash',
          'owner@s.whatsapp.net',
          now,
        ),
      ).toBeNull();
      expect((await repository.findActive(other))?.ownerVerifiedAt).toBeNull();
    });

    test('a challenge at its exact expiry cannot link an owner', async () => {
      const connection = await paired(owner, 'assistant@s.whatsapp.net');
      await repository.issueOwnerCode(connection, 'owner-hash', expiresAt);
      expect(
        await repository.verifyOwner(
          connection,
          'owner-hash',
          'owner@s.whatsapp.net',
          expiresAt,
        ),
      ).toBeNull();
    });

    test('issuing a new challenge invalidates the prior one', async () => {
      const connection = await paired(owner, 'assistant@s.whatsapp.net');
      await repository.issueOwnerCode(connection, 'old-hash', expiresAt);
      await repository.issueOwnerCode(connection, 'new-hash', expiresAt);
      expect(
        await repository.verifyOwner(
          connection,
          'old-hash',
          'owner@s.whatsapp.net',
          now,
        ),
      ).toBeNull();
    });

    test('an assistant cannot verify itself as the everyday owner', async () => {
      const connection = await paired(owner, 'assistant@s.whatsapp.net');
      await repository.issueOwnerCode(connection, 'owner-hash', expiresAt);
      expect(
        await repository.verifyOwner(
          connection,
          'owner-hash',
          'assistant@s.whatsapp.net',
          now,
        ),
      ).toBeNull();
    });

    test('an existing other-user identity cannot be stolen through verification', async () => {
      await prisma.externalIdentity.create({
        data: {
          userId: other,
          provider: 'whatsapp',
          externalId: 'taken@s.whatsapp.net',
        },
      });
      const connection = await paired(owner, 'assistant@s.whatsapp.net');
      await repository.issueOwnerCode(connection, 'owner-hash', expiresAt);
      await expect(
        repository.verifyOwner(
          connection,
          'owner-hash',
          'taken@s.whatsapp.net',
          now,
        ),
      ).rejects.toBeInstanceOf(WhatsAppConnectionConflict);
      expect((await repository.findActive(owner))?.ownerVerifiedAt).toBeNull();
    });

    test('provider message identifiers are deduplicated per receiving connection', async () => {
      const first = await repository.create(owner, randomUUID());
      const second = await repository.create(other, randomUUID());
      const message = {
        providerMessageId: 'same-provider-message',
        senderExternalId: 'owner@s.whatsapp.net',
        receivedAt: now,
      };

      const firstId = await repository.recordInbound(first, message);
      const secondId = await repository.recordInbound(second, message);
      expect(firstId).toEqual(expect.any(String));
      expect(secondId).toEqual(expect.any(String));
      expect(secondId).not.toBe(firstId);
      expect(await independent.recordInbound(first, message)).toBeNull();
    });

    test('revocation fences stale work and preserves historical identities', async () => {
      const connection = await paired(owner, 'assistant@s.whatsapp.net');
      await repository.issueOwnerCode(connection, 'owner-hash', expiresAt);
      await repository.verifyOwner(
        connection,
        'owner-hash',
        'owner@s.whatsapp.net',
        now,
      );
      await repository.revoke(owner, now);
      await expect(
        independent.serialized(connection, () => Promise.resolve('sent')),
      ).rejects.toBeInstanceOf(WhatsAppConnectionRevoked);
      expect(await repository.findActive(owner)).toBeNull();
      expect(
        await prisma.externalIdentity.count({ where: { userId: owner } }),
      ).toBe(1);
    });

    test('revocation permits a new device without reauthorizing the old generation', async () => {
      const old = await repository.create(owner, randomUUID());
      await repository.revoke(owner, now);
      const replacement = await independent.create(owner, randomUUID());
      expect(replacement.id).not.toBe(old.id);
      expect(await repository.update(old, { status: 'connected' })).toBeNull();
    });

    test('a failed inbound operation keeps its error and is not marked processed', async () => {
      const connection = await repository.create(owner, randomUUID());
      const id = await repository.recordInbound(connection, {
        providerMessageId: 'failed-message',
        senderExternalId: 'owner@s.whatsapp.net',
        receivedAt: now,
      });

      if (!id) throw new Error('Contract setup failed to record inbound.');
      await repository.finishInbound(id, {
        status: 'failed',
        error: 'Media download failed',
        now,
      });
      expect(
        await prisma.whatsAppConnectionInbound.findUnique({ where: { id } }),
      ).toMatchObject({
        status: 'failed',
        error: 'Media download failed',
        processedAt: null,
      });
    });

    test('independent workers cannot overlap side effects for the same connection', async () => {
      const connection = await repository.create(owner, randomUUID());
      const order: string[] = [];
      let releaseFirst!: () => void;
      let firstEntered!: () => void;
      const firstReady = new Promise<void>((resolve) => {
        firstEntered = resolve;
      });

      const release = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      const first = repository.serialized(connection, async () => {
        order.push('first-start');
        firstEntered();
        await release;
        order.push('first-end');
      });

      await firstReady;
      const second = independent.serialized(connection, () => {
        order.push('second');

        return Promise.resolve();
      });

      releaseFirst();
      await Promise.all([first, second]);
      expect(order).toEqual(['first-start', 'first-end', 'second']);
    });

    test('a different account can send while the first account is blocked', async () => {
      const firstConnection = await repository.create(owner, randomUUID());
      const secondConnection = await repository.create(other, randomUUID());
      let releaseFirst!: () => void;
      let firstEntered!: () => void;
      const firstReady = new Promise<void>((resolve) => {
        firstEntered = resolve;
      });

      const release = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      const first = repository.serialized(firstConnection, async () => {
        firstEntered();
        await release;
      });

      await firstReady;

      try {
        expect(
          await independent.serialized(secondConnection, () =>
            Promise.resolve('second-sent'),
          ),
        ).toBe('second-sent');
      } finally {
        releaseFirst();
        await first;
      }
    });
    test('QR assets are accessible only to their user during provider validity', async () => {
      const connection = await repository.create(owner, randomUUID());
      await repository.setQr(
        connection,
        'attempt-one',
        new Uint8Array([1, 2, 3]),
        expiresAt,
      );
      expect(await repository.getQr(other, 'attempt-one', now)).toBeNull();
      expect(
        await repository.getQr(owner, 'attempt-one', expiresAt),
      ).toBeNull();
      expect(await repository.getQr(owner, 'attempt-one', now)).toEqual(
        new Uint8Array([1, 2, 3]),
      );
    });

    test('revocation invalidates a previously accessible QR asset', async () => {
      const connection = await repository.create(owner, randomUUID());
      await repository.setQr(
        connection,
        'attempt-one',
        new Uint8Array([1]),
        expiresAt,
      );
      await repository.revoke(owner, now);
      expect(await repository.getQr(owner, 'attempt-one', now)).toBeNull();
    });

    test('provider confirmation discards the QR asset', async () => {
      const connection = await repository.create(owner, randomUUID());
      await repository.setQr(
        connection,
        'attempt-one',
        new Uint8Array([1]),
        expiresAt,
      );
      await repository.confirmAssistant(
        connection,
        'assistant@s.whatsapp.net',
        now,
      );
      expect(await repository.getQr(owner, 'attempt-one', now)).toBeNull();
    });

    test('cleanup attempts are claimed once and stop after three failures', async () => {
      const connection = await repository.create(owner, randomUUID());
      await repository.revoke(owner, now);
      const claims = await Promise.all([
        repository.claimCleanup(connection.id, 0),
        independent.claimCleanup(connection.id, 0),
      ]);

      expect(claims.filter(Boolean)).toHaveLength(1);
      await repository.cleanupResult(connection.id, 'Provider unavailable');
      expect(await repository.claimCleanup(connection.id, 1)).toBe(true);
      await repository.cleanupResult(connection.id, 'Provider unavailable');
      expect(await repository.claimCleanup(connection.id, 2)).toBe(true);
      await repository.cleanupResult(connection.id, 'Provider unavailable');
      expect(await repository.claimCleanup(connection.id, 3)).toBe(false);
      expect(
        await prisma.whatsAppConnection.findUnique({
          where: { id: connection.id },
        }),
      ).toMatchObject({ cleanupAttempts: 3, cleanupNeeded: true });
    });

    function networkBoundary(deviceId: string): ConnectionClient {
      return {
        ensureDevice: jest
          .fn<ConnectionClient['ensureDevice']>()
          .mockResolvedValue(undefined),
        status: jest.fn<ConnectionClient['status']>().mockResolvedValue({
          device_id: deviceId,
          is_connected: true,
          is_logged_in: true,
          jid: 'assistant@s.whatsapp.net',
        }),
        loginQr: jest
          .fn<ConnectionClient['loginQr']>()
          .mockResolvedValue({ image: Buffer.from([1]), durationSeconds: 30 }),
        logout: jest
          .fn<ConnectionClient['logout']>()
          .mockResolvedValue(undefined),
        removeDevice: jest
          .fn<ConnectionClient['removeDevice']>()
          .mockResolvedValue(undefined),
        reconnect: jest
          .fn<ConnectionClient['reconnect']>()
          .mockResolvedValue(undefined),
        sendText: jest
          .fn<ConnectionClient['sendText']>()
          .mockResolvedValue({ message_id: 'sent-message', status: 'sent' }),
        sendFile: jest
          .fn<ConnectionClient['sendFile']>()
          .mockResolvedValue({ message_id: 'sent-file', status: 'sent' }),
        markRead: jest
          .fn<ConnectionClient['markRead']>()
          .mockResolvedValue(undefined),
        sendChatPresence: jest
          .fn<ConnectionClient['sendChatPresence']>()
          .mockResolvedValue(undefined),
        downloadMedia: jest
          .fn<ConnectionClient['downloadMedia']>()
          .mockResolvedValue({
            message_id: 'message',
            status: 'ok',
            media_type: 'document',
            filename: 'file.txt',
            file_path: '/file.txt',
            file_size: 1,
          }),
      };
    }

    async function mediaConnection() {
      const connection = await paired(owner, 'assistant@s.whatsapp.net');
      await repository.issueOwnerCode(connection, 'media-proof', expiresAt);
      const verified = await repository.verifyOwner(
        connection,
        'media-proof',
        'owner@s.whatsapp.net',
        now,
      );

      if (!verified)
        throw new Error('Media fixture owner verification failed.');
      const client = networkBoundary(connection.deviceId);
      const download = jest.mocked(client.downloadMedia);
      download.mockResolvedValue({
        message_id: 'owner-image',
        status: 'ok',
        media_type: 'image',
        filename: 'image.jpg',
        file_path: 'statics/media/owner/2026-10-22/image.jpg',
        file_size: 3,
      });
      const gateway = new WhatsAppConnectionsGateway(
        repository,
        () => client,
        new ConfigService({
          BACKEND_WHATSAPP_GOWA_URL: 'http://127.0.0.1:3002',
        }),
      );

      return { connection: verified, gateway, download };
    }

    test('authorized media bytes are fetched from the selected device', async () => {
      const { connection, gateway, download } = await mediaConnection();
      const fetch = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));

      expect(
        await gateway.download(
          connection,
          'owner@s.whatsapp.net',
          'owner-image',
        ),
      ).toEqual(Buffer.from([1, 2, 3]));
      expect(download).toHaveBeenCalledWith(
        'owner@s.whatsapp.net',
        'owner-image',
      );
      expect(fetch).toHaveBeenCalledWith(
        new URL(
          'http://127.0.0.1:3002/statics/media/owner/2026-10-22/image.jpg',
        ),
        expect.objectContaining({
          headers: { 'X-Device-Id': connection.deviceId },
          redirect: 'error',
        }),
      );
    });

    test('a non-owner cannot trigger provider media download', async () => {
      const { connection, gateway, download } = await mediaConnection();
      await expect(
        gateway.download(connection, 'other@s.whatsapp.net', 'owner-image'),
      ).rejects.toBeInstanceOf(WhatsAppConnectionRevoked);
      expect(download).not.toHaveBeenCalled();
    });

    test.each([
      'http://example.test/statics/media/file.jpg',
      'http://127.0.0.1:3002/private/statics/file.jpg',
      'http://127.0.0.1:3002/statics/qrcode/scan-qr-test.png',
      'http://127.0.0.1:3002/statics/media/file.jpg?token=secret',
      'http://user:password@127.0.0.1:3002/statics/media/file.jpg',
    ])(
      'media asset outside the provider media directory is rejected: %s',
      async (file_path) => {
        const { connection, gateway, download } = await mediaConnection();
        download.mockResolvedValue({
          message_id: 'owner-image',
          status: 'ok',
          media_type: 'image',
          filename: 'image.jpg',
          file_path,
          file_size: 3,
        });
        const fetch = jest.spyOn(globalThis, 'fetch');
        await expect(
          gateway.download(connection, 'owner@s.whatsapp.net', 'owner-image'),
        ).rejects.toThrow('Untrusted WhatsApp media asset path');
        expect(fetch).not.toHaveBeenCalled();
      },
    );

    test('a mismatched provider media message ID is rejected before asset fetching', async () => {
      const { connection, gateway, download } = await mediaConnection();
      download.mockResolvedValue({
        message_id: 'different-message',
        status: 'ok',
        media_type: 'image',
        filename: 'image.jpg',
        file_path: 'statics/media/owner/image.jpg',
        file_size: 3,
      });
      const fetch = jest.spyOn(globalThis, 'fetch');
      await expect(
        gateway.download(connection, 'owner@s.whatsapp.net', 'owner-image'),
      ).rejects.toThrow('invalid media metadata');
      expect(fetch).not.toHaveBeenCalled();
    });

    test.each([-1, NaN, Infinity])(
      'malformed provider media size %p is rejected',
      async (file_size) => {
        const { connection, gateway, download } = await mediaConnection();
        download.mockResolvedValue({
          message_id: 'owner-image',
          status: 'ok',
          media_type: 'image',
          filename: 'image.jpg',
          file_path: 'statics/media/owner/image.jpg',
          file_size,
        });
        const fetch = jest.spyOn(globalThis, 'fetch');
        await expect(
          gateway.download(connection, 'owner@s.whatsapp.net', 'owner-image'),
        ).rejects.toThrow('invalid media metadata');
        expect(fetch).not.toHaveBeenCalled();
      },
    );

    test('GoWA session_id routes a JID-bearing webhook to its registered device', async () => {
      const connection = await paired(owner, 'assistant@s.whatsapp.net');
      await repository.issueOwnerCode(
        connection,
        'provider-envelope-code',
        expiresAt,
      );
      const verified = await repository.verifyOwner(
        connection,
        'provider-envelope-code',
        'owner@s.whatsapp.net',
        now,
      );

      if (!verified) throw new Error('Failed to verify owner fixture.');
      const gateway = new WhatsAppConnectionsGateway(
        repository,
        () => networkBoundary(connection.deviceId),
        new ConfigService(),
      );

      const handler = jest
        .fn<Parameters<WhatsAppConnectionsGateway['registerInbound']>[0]>()
        .mockResolvedValue(undefined);

      gateway.registerInbound(handler);

      await gateway.handleWebhook({
        event: 'message',
        session_id: connection.deviceId,
        device_id: 'assistant@s.whatsapp.net',
        payload: {
          id: 'actual-provider-envelope',
          chat_id: 'owner@s.whatsapp.net',
          from: 'owner@s.whatsapp.net',
          body: 'Hello',
        },
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ id: connection.id }),
        expect.objectContaining({
          whatsappConnection: {
            id: connection.id,
            generation: connection.generation,
          },
          text: 'Hello',
        }),
      );
    });

    test('a session_id cannot route a webhook bearing another assistant identity', async () => {
      const connection = await paired(owner, 'assistant@s.whatsapp.net');
      await repository.issueOwnerCode(
        connection,
        'provider-envelope-code',
        expiresAt,
      );
      const verified = await repository.verifyOwner(
        connection,
        'provider-envelope-code',
        'owner@s.whatsapp.net',
        now,
      );

      if (!verified) throw new Error('Failed to verify owner fixture.');
      const gateway = new WhatsAppConnectionsGateway(
        repository,
        () => networkBoundary(connection.deviceId),
        new ConfigService(),
      );

      const handler = jest
        .fn<Parameters<WhatsAppConnectionsGateway['registerInbound']>[0]>()
        .mockResolvedValue(undefined);

      gateway.registerInbound(handler);

      await gateway.handleWebhook({
        event: 'message',
        session_id: connection.deviceId,
        device_id: 'other-assistant@s.whatsapp.net',
        payload: {
          id: 'mismatched-provider-envelope',
          chat_id: 'owner@s.whatsapp.net',
          from: 'owner@s.whatsapp.net',
          body: 'Hello',
        },
      });

      expect(handler).not.toHaveBeenCalled();
    });

    test('reopening QR setup reuses an unexpired provider login attempt', async () => {
      const client = networkBoundary('unused');
      const gateway = new WhatsAppConnectionsGateway(
        repository,
        () => client,
        new ConfigService(),
      );

      const first = await gateway.beginQr(owner);

      const reopened = await gateway.beginQr(owner);

      expect(reopened).toEqual(first);
      expect(client.loginQr).toHaveBeenCalledTimes(1);
      expect(client.removeDevice).not.toHaveBeenCalled();
    });

    test('concurrent setup processes share one QR instead of revoking each others login', async () => {
      const client = networkBoundary('unused');
      const firstProcess = new WhatsAppConnectionsGateway(
        repository,
        () => client,
        new ConfigService(),
      );

      const secondProcess = new WhatsAppConnectionsGateway(
        independent,
        () => client,
        new ConfigService(),
      );

      const attempts = await Promise.all([
        firstProcess.beginQr(owner),
        secondProcess.beginQr(owner),
      ]);

      expect(attempts[1]).toEqual(attempts[0]);
      expect(client.loginQr).toHaveBeenCalledTimes(1);
      expect(client.removeDevice).not.toHaveBeenCalled();
    });

    test('an explicit QR refresh invalidates the old image and starts one new login', async () => {
      const client = networkBoundary('unused');
      const gateway = new WhatsAppConnectionsGateway(
        repository,
        () => client,
        new ConfigService(),
      );

      const first = await gateway.beginQr(owner);

      const refreshed = await gateway.beginQr(owner, true);

      expect(refreshed.attemptId).not.toBe(first.attemptId);
      expect(client.loginQr).toHaveBeenCalledTimes(2);
      expect(client.removeDevice).toHaveBeenCalledTimes(1);
      expect(
        await repository.getQr(owner, first.attemptId, new Date()),
      ).toBeNull();
    });

    test('an expired QR is replaced even without an explicit refresh', async () => {
      const client = networkBoundary('unused');
      const gateway = new WhatsAppConnectionsGateway(
        repository,
        () => client,
        new ConfigService(),
      );

      const first = await gateway.beginQr(owner);
      const connection = await repository.findActive(owner);
      if (!connection) throw new Error('Missing pending QR connection.');
      await repository.update(connection, { qrExpiresAt: new Date(0) });

      const refreshed = await gateway.beginQr(owner);

      expect(refreshed.attemptId).not.toBe(first.attemptId);
      expect(client.loginQr).toHaveBeenCalledTimes(2);
      expect(client.removeDevice).toHaveBeenCalledTimes(1);
    });

    test('an unknown receiving device never reaches assistant handling', async () => {
      const client = networkBoundary('unknown');
      const gateway = new WhatsAppConnectionsGateway(
        repository,
        () => client,
        new ConfigService(),
      );

      const inbound = jest.fn<Parameters<typeof gateway.registerInbound>[0]>();
      gateway.registerInbound(inbound);
      await gateway.handleWebhook({
        event: 'message',
        device_id: 'unknown',
        payload: { id: 'message', body: 'hello', from: 'owner@s.whatsapp.net' },
      });
      expect(inbound).not.toHaveBeenCalled();
    });

    test('the owner of another assistant is ignored on this receiving device', async () => {
      const connection = await paired(owner, 'assistant@s.whatsapp.net');
      await repository.issueOwnerCode(connection, 'owner-hash', expiresAt);
      await repository.verifyOwner(
        connection,
        'owner-hash',
        'owner@s.whatsapp.net',
        now,
      );
      const gateway = new WhatsAppConnectionsGateway(
        repository,
        () => networkBoundary(connection.deviceId),
        new ConfigService(),
      );

      const inbound = jest.fn<Parameters<typeof gateway.registerInbound>[0]>();
      gateway.registerInbound(inbound);
      await gateway.handleWebhook({
        event: 'message',
        device_id: connection.deviceId,
        payload: {
          id: 'message',
          body: 'hello',
          from: 'other-owner@s.whatsapp.net',
        },
      });
      expect(inbound).not.toHaveBeenCalled();
    });

    test('group messages from the verified owner are ignored even with a mention', async () => {
      const connection = await paired(owner, 'assistant@s.whatsapp.net');
      await repository.issueOwnerCode(connection, 'owner-hash', expiresAt);
      await repository.verifyOwner(
        connection,
        'owner-hash',
        'owner@s.whatsapp.net',
        now,
      );
      const gateway = new WhatsAppConnectionsGateway(
        repository,
        () => networkBoundary(connection.deviceId),
        new ConfigService(),
      );

      const inbound = jest.fn<Parameters<typeof gateway.registerInbound>[0]>();
      gateway.registerInbound(inbound);
      await gateway.handleWebhook({
        event: 'message',
        device_id: connection.deviceId,
        payload: {
          id: 'message',
          body: '@assistant hello',
          chat_id: 'group@g.us',
          from: 'owner@s.whatsapp.net',
        },
      });
      expect(inbound).not.toHaveBeenCalled();
    });

    test('accepted owner messages carry connection generation into durable channel handling', async () => {
      const connection = await paired(owner, 'assistant@s.whatsapp.net');
      await repository.issueOwnerCode(connection, 'owner-hash', expiresAt);
      await repository.verifyOwner(
        connection,
        'owner-hash',
        'owner@s.whatsapp.net',
        now,
      );
      const gateway = new WhatsAppConnectionsGateway(
        repository,
        () => networkBoundary(connection.deviceId),
        new ConfigService(),
      );

      const inbound = jest
        .fn<Parameters<typeof gateway.registerInbound>[0]>()
        .mockResolvedValue(undefined);

      gateway.registerInbound(inbound);
      await gateway.handleWebhook({
        event: 'message',
        device_id: connection.deviceId,
        payload: { id: 'message', body: 'hello', from: 'owner@s.whatsapp.net' },
      });
      expect(inbound).toHaveBeenCalledWith(
        expect.objectContaining({ userId: owner }),
        expect.objectContaining({
          whatsappConnection: { id: connection.id, generation: 1 },
          text: 'hello',
        }),
      );
    });

    test('unverified assistant cannot send even when the provider is connected', async () => {
      const connection = await paired(owner, 'assistant@s.whatsapp.net');
      const client = networkBoundary(connection.deviceId);
      const gateway = new WhatsAppConnectionsGateway(
        repository,
        () => client,
        new ConfigService(),
      );

      await expect(
        gateway.send(connection, (transport) =>
          transport.sendText('owner@s.whatsapp.net', 'hello'),
        ),
      ).rejects.toBeInstanceOf(WhatsAppConnectionRevoked);
      expect(client.sendText).not.toHaveBeenCalled();
    });
  },
);
