import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { IWhatsAppRepository } from '../../database/interfaces';
import { WhatsAppGatewayService } from './whatsapp.gateway';
import type { WhatsAppClient, WhatsAppClientFactory } from './whatsapp.types';

describe('WhatsApp gateway runtime flag', () => {
  it('does not load state or create a client when runtime is disabled', async () => {
    const config = {
      get: jest.fn(() => false),
    } as unknown as ConfigService;

    const getGatewayState = jest.fn();
    const repository = { getGatewayState } as unknown as IWhatsAppRepository;
    const factory = jest.fn<WhatsAppClientFactory>();
    const gateway = new WhatsAppGatewayService(config, repository, factory);

    await gateway.onModuleInit();

    expect(getGatewayState).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
    expect(gateway.getClient()).toBeNull();
  });

  it('allows only one process-local owner for a session store', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sydia-whatsapp-lock-'));
    const store = join(directory, 'session.db');
    const config = {
      get: jest.fn((key: string, fallback?: unknown) =>
        key === 'BACKEND_WHATSAPP_STORE_PATH' ? store : fallback,
      ),
    } as unknown as ConfigService;

    const getGatewayState = jest
      .fn<IWhatsAppRepository['getGatewayState']>()
      .mockResolvedValue(null);

    const repository = { getGatewayState } as unknown as IWhatsAppRepository;

    const client = {
      on: jest.fn(),
      init: jest.fn<WhatsAppClient['init']>().mockResolvedValue({}),
      isLoggedIn: jest
        .fn<WhatsAppClient['isLoggedIn']>()
        .mockResolvedValue(false),
      disconnect: jest
        .fn<WhatsAppClient['disconnect']>()
        .mockResolvedValue(undefined),
      close: jest.fn<WhatsAppClient['close']>(),
    } as unknown as WhatsAppClient;

    const firstFactory = jest.fn(
      () => client,
    ) as unknown as WhatsAppClientFactory;

    const secondFactory = jest.fn() as unknown as WhatsAppClientFactory;
    const first = new WhatsAppGatewayService(config, repository, firstFactory);
    const second = new WhatsAppGatewayService(
      config,
      repository,
      secondFactory,
    );

    try {
      await first.onModuleInit();
      await second.onModuleInit();

      expect(firstFactory).toHaveBeenCalledTimes(1);
      expect(secondFactory).not.toHaveBeenCalled();
      expect(second.getStatus().recoveryReason).toBe(
        'WhatsApp companion is active in another Sydia process.',
      );
    } finally {
      await first.onModuleDestroy();
      await second.onModuleDestroy();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('does not reconnect an already-connected client before pairing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sydia-whatsapp-pair-'));
    const store = join(directory, 'session.db');
    const config = {
      get: jest.fn((key: string, fallback?: unknown) =>
        key === 'BACKEND_WHATSAPP_STORE_PATH' ? store : fallback,
      ),
    } as unknown as ConfigService;

    const getGatewayState = jest
      .fn<IWhatsAppRepository['getGatewayState']>()
      .mockResolvedValue(null);

    const updateGatewayState = jest
      .fn<IWhatsAppRepository['updateGatewayState']>()
      .mockResolvedValue({} as never);

    const repository = {
      getGatewayState,
      updateGatewayState,
    } as unknown as IWhatsAppRepository;

    const connect = jest.fn<WhatsAppClient['connect']>();
    const pairCode = jest
      .fn<WhatsAppClient['pairCode']>()
      .mockResolvedValue('ABCD-EFGH');

    const client = {
      on: jest.fn(),
      init: jest.fn<WhatsAppClient['init']>().mockResolvedValue({}),
      isLoggedIn: jest
        .fn<WhatsAppClient['isLoggedIn']>()
        .mockResolvedValue(false),
      isConnected: jest
        .fn<WhatsAppClient['isConnected']>()
        .mockResolvedValue(true),
      connect,
      pairCode,
      disconnect: jest
        .fn<WhatsAppClient['disconnect']>()
        .mockResolvedValue(undefined),
      close: jest.fn<WhatsAppClient['close']>(),
    } as unknown as WhatsAppClient;

    const factory = jest.fn(() => client) as unknown as WhatsAppClientFactory;
    const gateway = new WhatsAppGatewayService(config, repository, factory);

    try {
      await gateway.onModuleInit();
      await expect(gateway.requestPairCode('62851693319118')).resolves.toBe(
        'ABCD-EFGH',
      );
      expect(connect).not.toHaveBeenCalled();
      expect(pairCode).toHaveBeenCalledWith('62851693319118');
    } finally {
      await gateway.onModuleDestroy();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
