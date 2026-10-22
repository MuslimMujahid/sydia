import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

class RedisFixture {
  static instances: RedisFixture[] = [];
  status = 'ready';
  on = jest.fn();
  connect = jest.fn<() => Promise<void>>().mockResolvedValue();
  eval = jest
    .fn<(...args: unknown[]) => Promise<unknown>>()
    .mockResolvedValue(0);

  get = jest
    .fn<(...args: unknown[]) => Promise<string | null>>()
    .mockResolvedValue(null);

  getdel = jest
    .fn<(...args: unknown[]) => Promise<string | null>>()
    .mockResolvedValue(null);

  set = jest
    .fn<(...args: unknown[]) => Promise<string>>()
    .mockResolvedValue('OK');

  del = jest.fn<(...args: unknown[]) => Promise<number>>().mockResolvedValue(1);
  quit = jest.fn<() => Promise<string>>().mockResolvedValue('OK');
  constructor() {
    RedisFixture.instances.push(this);
  }
}

jest.unstable_mockModule('ioredis', () => ({ Redis: RedisFixture }));
let AuthSecurityService: typeof import('./auth-security.service.js').AuthSecurityService;
beforeAll(async () => {
  ({ AuthSecurityService } = await import('./auth-security.service.js'));
});
afterEach(() => {
  jest.restoreAllMocks();
});

function setup(overrides: Record<string, unknown> = {}) {
  const config = new ConfigService({
    BACKEND_AUTH_SECRET: 'authentication-unit-test-secret',
    BACKEND_REDIS_URL: 'redis://example.test:6379',
    ...overrides,
  });

  const service = new AuthSecurityService(config);
  const redis = RedisFixture.instances.at(-1);
  if (!redis) throw new Error('Redis boundary fixture was not created');

  return { service, redis };
}

describe('authentication protection storage', () => {
  it('rejects invalid configured sending limits at startup', () => {
    expect(() =>
      setup({ BACKEND_AUTH_SENDS_PER_HOUR: 'not-a-number' }),
    ).toThrow('BACKEND_AUTH_SENDS_PER_HOUR must be a positive integer.');
  });

  it('initializes the connection before serving authentication requests', async () => {
    const { service, redis } = setup();
    await service.onModuleInit();
    expect(redis.connect).toHaveBeenCalledTimes(1);
  });

  it('fails closed and logs a safe diagnostic when the protection store rejects a command', async () => {
    const { service, redis } = setup();
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    redis.eval.mockRejectedValue(
      new Error('redis://credential:secret@example.test'),
    );
    await expect(service.limitSend('owner@example.com')).rejects.toMatchObject({
      status: 'SERVICE_UNAVAILABLE',
      body: { code: 'AUTH_PROTECTION_UNAVAILABLE' },
    });
    expect(log).toHaveBeenCalledWith(
      'Authentication protection operation failed. Check BACKEND_REDIS_URL and Redis availability. No authentication proof or code was accepted.',
    );
  });

  it('returns the server cooldown when a sending budget is exhausted', async () => {
    const { service, redis } = setup();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    redis.eval.mockResolvedValue(48);
    await expect(service.limitSend('owner@example.com')).rejects.toMatchObject({
      status: 'TOO_MANY_REQUESTS',
      body: { code: 'AUTH_RATE_LIMITED', retryAfter: 48 },
    });
  });

  it('fails closed when a saturated Redis counter has lost its expiry', async () => {
    const { service, redis } = setup();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    redis.eval.mockResolvedValue(-1);
    await expect(service.limitGuess('owner@example.com')).rejects.toMatchObject(
      {
        status: 'SERVICE_UNAVAILABLE',
        body: { code: 'AUTH_PROTECTION_UNAVAILABLE' },
      },
    );
  });

  it('stores short-lived authentication proofs with an explicit Redis expiry', async () => {
    const { service, redis } = setup();
    await service.set('proof:session-id', 'password', 600);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:security:[a-f0-9]{64}$/),
      'password',
      'EX',
      600,
    );
  });

  it('accepts a code only when the atomic store consumes its challenge', async () => {
    const { service, redis } = setup();
    redis.eval.mockResolvedValue(1);

    await expect(
      service.consumeOTP(
        'otp:email-verification:owner@example.com',
        'candidate-hash',
      ),
    ).resolves.toBeUndefined();
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      expect.stringMatching(/^auth:security:[a-f0-9]{64}$/),
      'candidate-hash',
    );
  });

  it('surfaces the fifth wrong guess as an invalidated challenge', async () => {
    const { service, redis } = setup();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    redis.eval.mockResolvedValue(-1);

    await expect(
      service.consumeOTP(
        'otp:email-verification:owner@example.com',
        'wrong-hash',
      ),
    ).rejects.toMatchObject({
      status: 'FORBIDDEN',
      body: { code: 'TOO_MANY_ATTEMPTS' },
    });
  });

  it('returns the remaining attempts from the atomic wrong-code result', async () => {
    const { service, redis } = setup();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    redis.eval.mockResolvedValue([0, 4]);

    await expect(
      service.consumeOTP(
        'otp:email-verification:owner@example.com',
        'wrong-hash',
      ),
    ).rejects.toMatchObject({
      status: 'BAD_REQUEST',
      body: { code: 'INVALID_OTP', attemptsRemaining: 4 },
    });
  });

  it('fails closed and logs invalid challenge storage state', async () => {
    const { service, redis } = setup();
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    redis.eval.mockResolvedValue(-3);

    await expect(
      service.consumeOTP(
        'otp:email-verification:owner@example.com',
        'candidate-hash',
      ),
    ).rejects.toMatchObject({
      status: 'SERVICE_UNAVAILABLE',
      body: { code: 'AUTH_PROTECTION_UNAVAILABLE' },
    });
    expect(log).toHaveBeenCalledWith(
      'Authentication challenge storage returned invalid state. Inspect Redis auth protection keys.',
    );
  });
});
