import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { Redis } from 'ioredis';
import { APIError } from 'better-auth/api';

export interface AuthSecurity {
  limitSend(email: string): Promise<void>;
  limitGuess(email: string): Promise<void>;
  get(key: string): Promise<string | null>;
  consume(key: string): Promise<string | null>;
  consumeOTP(key: string, candidateHash: string): Promise<void>;
  set(key: string, value: string, ttl: number): Promise<void>;
  delete(key: string): Promise<void>;
}

// All counters are checked before any is incremented. Resending never clears
// hourly or daily budgets. Keys contain keyed hashes, never email addresses.
const RESERVE = `
for i,key in ipairs(KEYS) do
  if tonumber(redis.call('GET',key) or '0') >= tonumber(ARGV[(i-1)*2+1]) then
    return redis.call('TTL',key)
  end
end
for i,key in ipairs(KEYS) do
  local count=redis.call('INCR',key)
  if count==1 then redis.call('EXPIRE',key,ARGV[(i-1)*2+2]) end
end
return 0`;

// Wrong guesses never reach the plugin's consume/recreate retry path, which
// could restore an old OTP during a resend. Correct codes pass exactly once.
const CONSUME_OTP = `
local value=redis.call('GET',KEYS[1])
if not value then return -2 end
local hash,attempts=string.match(value,'^(.+):(%d+)$')
if not hash then return -3 end
attempts=tonumber(attempts)
if attempts>=5 then return -1 end
if hash~=ARGV[1] then
  attempts=attempts+1
  redis.call('SET',KEYS[1],hash..':'..attempts,'KEEPTTL')
  if attempts>=5 then return -1 end
  return {0,5-attempts}
end
redis.call('DEL',KEYS[1])
return 1`;

@Injectable()
export class AuthSecurityService
  implements AuthSecurity, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AuthSecurityService.name);
  private readonly redis: Redis;
  private readonly secret: string;
  private readonly hourlySends: number;
  private readonly dailySends: number;
  private readonly hourlyGuesses: number;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('BACKEND_AUTH_SECRET');
    this.hourlySends = this.positiveLimit(
      config,
      'BACKEND_AUTH_SENDS_PER_HOUR',
      5,
    );
    this.dailySends = this.positiveLimit(
      config,
      'BACKEND_AUTH_SENDS_PER_DAY',
      10,
    );
    this.hourlyGuesses = this.positiveLimit(
      config,
      'BACKEND_AUTH_GUESSES_PER_HOUR',
      20,
    );
    this.redis = new Redis(config.getOrThrow<string>('BACKEND_REDIS_URL'), {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      connectTimeout: 5_000,
      retryStrategy: (attempts) =>
        attempts <= 3 ? Math.min(attempts * 250, 1000) : null,
    });
    this.redis.on('error', () =>
      this.logger.error(
        'Authentication protection storage is unavailable. Check BACKEND_REDIS_URL. Auth operations fail closed.',
      ),
    );
  }

  private positiveLimit(
    config: ConfigService,
    key: string,
    defaultValue: number,
  ): number {
    const value = Number(config.get<string | number>(key, defaultValue));
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error(`${key} must be a positive integer.`);

    return value;
  }

  async onModuleInit(): Promise<void> {
    await this.storageOperation(() => this.redis.connect());
  }

  private async storageOperation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      this.logger.error(
        'Authentication protection operation failed. Check BACKEND_REDIS_URL and Redis availability. No authentication proof or code was accepted.',
      );
      throw new APIError('SERVICE_UNAVAILABLE', {
        code: 'AUTH_PROTECTION_UNAVAILABLE',
        message: 'Verifikasi belum tersedia. Silakan coba lagi nanti.',
      });
    }
  }

  private key(value: string): string {
    return `auth:security:${createHmac('sha256', this.secret).update(value).digest('hex')}`;
  }

  private async reserve(
    email: string,
    budgets: [string, number, number][],
  ): Promise<void> {
    const keys = budgets.map(([name]) =>
      this.key(`${name}:${email.toLowerCase()}`),
    );

    const retryAfter = await this.storageOperation(() =>
      this.redis.eval(
        RESERVE,
        keys.length,
        ...keys,
        ...budgets.flatMap(([, limit, seconds]) => [limit, seconds]),
      ),
    );

    if (typeof retryAfter !== 'number' || retryAfter < 0) {
      this.logger.error(
        'Authentication rate-limit storage returned an invalid counter or TTL. Inspect the auth protection keys in Redis.',
      );
      throw new APIError('SERVICE_UNAVAILABLE', {
        code: 'AUTH_PROTECTION_UNAVAILABLE',
        message: 'Verifikasi belum tersedia. Silakan coba lagi nanti.',
      });
    }

    if (retryAfter > 0) {
      this.logger.warn('Authentication challenge rate limit reached.');
      throw new APIError('TOO_MANY_REQUESTS', {
        code: 'AUTH_RATE_LIMITED',
        message: 'Tunggu sebelum mencoba lagi.',
        retryAfter,
      });
    }
  }

  limitSend(email: string): Promise<void> {
    return this.reserve(email, [
      ['send-cooldown', 1, 60],
      ['send-hour', this.hourlySends, 3600],
      ['send-day', this.dailySends, 86400],
    ]);
  }

  limitGuess(email: string): Promise<void> {
    return this.reserve(email, [['guess-hour', this.hourlyGuesses, 3600]]);
  }

  /** Account setup only; never used to gate conversations or notifications. */
  limitWhatsAppSetup(userId: string): Promise<void> {
    return this.reserve(userId, [
      ['whatsapp-setup-minute', 5, 60],
      ['whatsapp-setup-hour', 60, 3600],
    ]);
  }

  get(key: string): Promise<string | null> {
    return this.storageOperation(() => this.redis.get(this.key(key)));
  }

  consume(key: string): Promise<string | null> {
    return this.storageOperation(() => this.redis.getdel(this.key(key)));
  }

  async consumeOTP(key: string, candidateHash: string): Promise<void> {
    const result = await this.storageOperation(() =>
      this.redis.eval(CONSUME_OTP, 1, this.key(key), candidateHash),
    );

    if (result === 1) return;

    const attemptsRemaining =
      Array.isArray(result) &&
      result.length === 2 &&
      result[0] === 0 &&
      typeof result[1] === 'number' &&
      Number.isInteger(result[1]) &&
      result[1] >= 1 &&
      result[1] <= 4
        ? result[1]
        : undefined;

    if (attemptsRemaining !== undefined || result === -1 || result === -2) {
      this.logger.warn(
        'Authentication code rejected by the atomic challenge gate.',
      );
      throw new APIError(result === -1 ? 'FORBIDDEN' : 'BAD_REQUEST', {
        code:
          result === -1
            ? 'TOO_MANY_ATTEMPTS'
            : result === -2
              ? 'OTP_EXPIRED'
              : 'INVALID_OTP',
        message:
          result === -1
            ? 'Batas percobaan tercapai. Minta kode baru.'
            : result === -2
              ? 'Kode tidak lagi berlaku. Minta kode baru.'
              : 'Kode belum cocok. Periksa kembali kode Anda.',
        ...(attemptsRemaining !== undefined ? { attemptsRemaining } : {}),
      });
    }

    this.logger.error(
      'Authentication challenge storage returned invalid state. Inspect Redis auth protection keys.',
    );
    throw new APIError('SERVICE_UNAVAILABLE', {
      code: 'AUTH_PROTECTION_UNAVAILABLE',
      message: 'Verifikasi belum tersedia. Silakan coba lagi nanti.',
    });
  }

  async set(key: string, value: string, ttl: number): Promise<void> {
    await this.storageOperation(() =>
      this.redis.set(this.key(key), value, 'EX', ttl),
    );
  }

  async delete(key: string): Promise<void> {
    await this.storageOperation(() => this.redis.del(this.key(key)));
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'end')
      await this.storageOperation(() => this.redis.quit());
  }
}
