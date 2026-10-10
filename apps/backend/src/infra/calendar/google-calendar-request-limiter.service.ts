import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import Redis from 'ioredis';

export type GoogleCalendarRequestLane =
  'outbound' | 'pull' | 'import' | 'interactive' | 'watch';

export type GoogleCalendarRequestContext = {
  googleSubject: string;
  calendarId: string | null;
  lane: GoogleCalendarRequestLane;
  beforeRequest?: () => Promise<void>;
};

export type GoogleCalendarRequestLease = {
  id: string;
  keys: readonly [string, string, string, string, string, string];
};

export class GoogleCalendarRequestFencedError extends Error {
  constructor() {
    super(
      'The calendar request no longer owns an active claim with sufficient lease time.',
    );
    this.name = 'calendar_request_fenced';
  }
}

export class GoogleCalendarRequestDeferredError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('Google Calendar request capacity is temporarily reserved.');
    this.name = 'GoogleCalendarRequestDeferredError';
  }
}

export class GoogleCalendarAdmissionUnavailableError extends Error {
  constructor() {
    super(
      'Google Calendar request admission is unavailable because Redis could not be reached.',
    );
    this.name = 'GoogleCalendarAdmissionUnavailableError';
  }
}

const RESERVE_GOOGLE_CALENDAR_REQUEST = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local requestId = ARGV[1]
local leaseMs = tonumber(ARGV[2])
local retryAfter = 0
local tokenKeys = {KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6]}
local tokenRates = {tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5]), tonumber(ARGV[6]), tonumber(ARGV[7]), tonumber(ARGV[8])}
local tokenBursts = {tonumber(ARGV[9]), tonumber(ARGV[10]), tonumber(ARGV[11]), tonumber(ARGV[12]), tonumber(ARGV[13]), tonumber(ARGV[14])}

for i = 1, 6 do
  local rate = tokenRates[i]
  if rate > 0 then
    local burst = tokenBursts[i]
    local tokens = tonumber(redis.call('HGET', tokenKeys[i], 'tokens'))
    local updatedAt = tonumber(redis.call('HGET', tokenKeys[i], 'updatedAt'))
    if not tokens or not updatedAt then
      tokens = burst
      updatedAt = now
    else
      tokens = math.min(burst, tokens + math.max(0, now - updatedAt) * rate / 60000)
      updatedAt = now
    end
    if tokens < 1 then
      retryAfter = math.max(retryAfter, math.ceil((1 - tokens) * 60000 / rate))
    end
    redis.call('HSET', tokenKeys[i], 'tokens', tokens, 'updatedAt', updatedAt)
    redis.call('PEXPIRE', tokenKeys[i], 120000)
  end
end

local concurrencyKeys = {KEYS[7], KEYS[8], KEYS[9], KEYS[10], KEYS[11], KEYS[12]}
local limits = {tonumber(ARGV[15]), tonumber(ARGV[16]), tonumber(ARGV[17]), tonumber(ARGV[18]), tonumber(ARGV[19]), tonumber(ARGV[20])}
for i = 1, 6 do
  local limit = limits[i]
  if limit > 0 then
    redis.call('ZREMRANGEBYSCORE', concurrencyKeys[i], '-inf', now)
    local active = redis.call('ZCARD', concurrencyKeys[i])
    if active >= limit then
      local index = active - limit
      local expiring = redis.call('ZRANGE', concurrencyKeys[i], index, index, 'WITHSCORES')
      if expiring[2] then
        retryAfter = math.max(retryAfter, tonumber(expiring[2]) - now)
      end
    end
  end
end

if retryAfter > 0 then
  return {0, retryAfter}
end

for i = 1, 6 do
  if tokenRates[i] > 0 then
    redis.call('HINCRBYFLOAT', tokenKeys[i], 'tokens', -1)
  end
  if limits[i] > 0 then
    redis.call('ZADD', concurrencyKeys[i], now + leaseMs, requestId)
    redis.call('PEXPIRE', concurrencyKeys[i], leaseMs * 2)
  end
end

return {1, 0}
`;

const RELEASE_GOOGLE_CALENDAR_REQUEST = `
for i = 1, #KEYS do
  redis.call('ZREM', KEYS[i], ARGV[1])
end
return 1
`;

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function positiveInteger(
  config: ConfigService,
  key: string,
  defaultValue: number,
): number {
  const raw = config.get<number | string>(key, defaultValue);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${key} must be a positive integer.`);

  return value;
}

function budgetShare(
  config: ConfigService,
  key: string,
  defaultValue: number,
): number {
  const raw = config.get<number | string>(key, defaultValue);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 1)
    throw new Error(`${key} must be a number greater than 0 and at most 1.`);

  return value;
}

@Injectable()
export class GoogleCalendarRequestLimiter implements OnModuleDestroy {
  private readonly logger = new Logger(GoogleCalendarRequestLimiter.name);
  private readonly redis: Redis;
  private readonly prefix: string;
  private readonly projectRequestsPerMinute: number;
  private readonly userRequestsPerMinute: number;
  private readonly calendarRequestsPerMinute: number;
  private readonly projectConcurrency: number;
  private readonly userConcurrency: number;
  private readonly calendarConcurrency: number;
  private readonly projectBurst: number;
  private readonly userBurst: number;
  private readonly calendarBurst: number;
  private readonly requestLeaseMs: number;
  private readonly laneWeights: Record<GoogleCalendarRequestLane, number>;
  private connectionReady: Promise<void> | null = null;

  constructor(config: ConfigService) {
    const clientId = config.get<string>('BACKEND_GOOGLE_CLIENT_ID', '').trim();
    const quotaProjectKey =
      config.get<string>('BACKEND_GOOGLE_CALENDAR_QUOTA_PROJECT_KEY')?.trim() ||
      clientId ||
      'google-calendar-unconfigured';

    const projectKey = hash(quotaProjectKey);
    this.prefix = `sydia:google-calendar:{${projectKey}}`;
    this.projectRequestsPerMinute = positiveInteger(
      config,
      'BACKEND_GOOGLE_CALENDAR_PROJECT_QPM',
      7_000,
    );
    this.userRequestsPerMinute = positiveInteger(
      config,
      'BACKEND_GOOGLE_CALENDAR_USER_QPM',
      420,
    );
    this.calendarRequestsPerMinute = positiveInteger(
      config,
      'BACKEND_GOOGLE_CALENDAR_ID_QPM',
      120,
    );
    this.projectConcurrency = positiveInteger(
      config,
      'BACKEND_GOOGLE_CALENDAR_PROJECT_CONCURRENCY',
      32,
    );
    this.userConcurrency = positiveInteger(
      config,
      'BACKEND_GOOGLE_CALENDAR_USER_CONCURRENCY',
      4,
    );
    this.calendarConcurrency = positiveInteger(
      config,
      'BACKEND_GOOGLE_CALENDAR_ID_CONCURRENCY',
      1,
    );
    this.projectBurst = positiveInteger(
      config,
      'BACKEND_GOOGLE_CALENDAR_PROJECT_BURST',
      100,
    );
    this.userBurst = positiveInteger(
      config,
      'BACKEND_GOOGLE_CALENDAR_USER_BURST',
      10,
    );
    this.calendarBurst = positiveInteger(
      config,
      'BACKEND_GOOGLE_CALENDAR_ID_BURST',
      5,
    );
    this.requestLeaseMs = positiveInteger(
      config,
      'BACKEND_GOOGLE_CALENDAR_REQUEST_LEASE_MS',
      20_000,
    );
    if (this.requestLeaseMs < 16_000)
      throw new Error(
        'BACKEND_GOOGLE_CALENDAR_REQUEST_LEASE_MS must exceed the 15-second Google Calendar HTTP timeout.',
      );
    this.laneWeights = {
      outbound: budgetShare(
        config,
        'BACKEND_GOOGLE_CALENDAR_OUTBOUND_BUDGET_SHARE',
        0.4,
      ),
      pull: budgetShare(
        config,
        'BACKEND_GOOGLE_CALENDAR_PULL_BUDGET_SHARE',
        0.3,
      ),
      import: budgetShare(
        config,
        'BACKEND_GOOGLE_CALENDAR_IMPORT_BUDGET_SHARE',
        0.18,
      ),
      interactive: budgetShare(
        config,
        'BACKEND_GOOGLE_CALENDAR_INTERACTIVE_BUDGET_SHARE',
        0.1,
      ),
      watch: budgetShare(
        config,
        'BACKEND_GOOGLE_CALENDAR_WATCH_BUDGET_SHARE',
        0.02,
      ),
    };
    const totalBudgetShare = Object.values(this.laneWeights).reduce(
      (total, weight) => total + weight,
      0,
    );

    if (Math.abs(totalBudgetShare - 1) > 0.001)
      throw new Error('Google Calendar lane budget shares must sum to 1.');
    this.redis = new Redis(config.getOrThrow<string>('BACKEND_REDIS_URL'), {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      commandTimeout: 5_000,
      connectTimeout: 500,
    });
    this.redis.on('error', (error: Error) => {
      this.logger.error(
        'Google Calendar request limiter Redis connection failed.',
        error.stack,
      );
    });
  }

  async acquire(
    context: GoogleCalendarRequestContext,
  ): Promise<GoogleCalendarRequestLease> {
    if (!context.googleSubject.trim())
      throw new Error(
        'A verified Google subject is required for Calendar API admission.',
      );

    const id = randomUUID();
    const subjectHash = hash(context.googleSubject);
    const calendarHash = context.calendarId
      ? hash(context.calendarId)
      : `catalog-${subjectHash}`;

    const laneKey = `${this.prefix}:lane:${context.lane}`;
    const rateKeys = [
      `${this.prefix}:project:rate`,
      `${this.prefix}:user:${subjectHash}:rate`,
      `${this.prefix}:calendar:${calendarHash}:rate`,
      `${laneKey}:rate`,
      `${this.prefix}:user:${subjectHash}:lane:${context.lane}:rate`,
      `${this.prefix}:calendar:${calendarHash}:lane:${context.lane}:rate`,
    ] as const;

    const concurrencyKeys = [
      `${this.prefix}:project:inflight`,
      `${this.prefix}:user:${subjectHash}:inflight`,
      `${this.prefix}:calendar:${calendarHash}:inflight`,
      `${laneKey}:inflight`,
      `${this.prefix}:user:${subjectHash}:lane:${context.lane}:inflight`,
      `${this.prefix}:calendar:${calendarHash}:lane:${context.lane}:inflight`,
    ] as const;

    const hasCalendar = context.calendarId !== null;
    const laneWeight = this.laneWeights[context.lane];

    let result: unknown;

    try {
      await this.waitForRedisReady();
      result = await this.redis.eval(
        RESERVE_GOOGLE_CALENDAR_REQUEST,
        12,
        ...rateKeys,
        ...concurrencyKeys,
        id,
        this.requestLeaseMs,
        this.projectRequestsPerMinute,
        this.userRequestsPerMinute,
        hasCalendar ? this.calendarRequestsPerMinute : 0,
        Math.max(1, Math.floor(this.projectRequestsPerMinute * laneWeight)),
        Math.max(1, Math.floor(this.userRequestsPerMinute * laneWeight)),
        hasCalendar
          ? Math.max(1, Math.floor(this.calendarRequestsPerMinute * laneWeight))
          : 0,
        this.projectBurst,
        this.userBurst,
        this.calendarBurst,
        Math.max(1, Math.floor(this.projectBurst * laneWeight)),
        Math.max(1, Math.floor(this.userBurst * laneWeight)),
        Math.max(1, Math.floor(this.calendarBurst * laneWeight)),
        this.projectConcurrency,
        this.userConcurrency,
        hasCalendar ? this.calendarConcurrency : 0,
        Math.max(1, Math.floor(this.projectConcurrency * laneWeight)),
        Math.max(1, Math.floor(this.userConcurrency * laneWeight)),
        hasCalendar
          ? Math.max(1, Math.floor(this.calendarConcurrency * laneWeight))
          : 0,
      );
    } catch (error: unknown) {
      this.logger.error(
        'Google Calendar API request denied because shared Redis admission failed.',
        error instanceof Error ? error.stack : undefined,
      );
      throw new GoogleCalendarAdmissionUnavailableError();
    }

    if (
      !Array.isArray(result) ||
      result.length !== 2 ||
      typeof result[0] !== 'number' ||
      typeof result[1] !== 'number'
    )
      throw new Error(
        'Google Calendar Redis admission returned an invalid response.',
      );

    if (result[0] !== 1)
      throw new GoogleCalendarRequestDeferredError(
        Math.max(1_000, Math.ceil(result[1])),
      );

    return { id, keys: concurrencyKeys };
  }

  private async waitForRedisReady(): Promise<void> {
    if (this.redis.status === 'ready') return;
    if (this.connectionReady) return this.connectionReady;

    const connectionReady = new Promise<void>((resolve, reject) => {
      const onReady = () => {
        clearTimeout(timeout);
        resolve();
      };

      const timeout = setTimeout(() => {
        this.redis.removeListener('ready', onReady);
        reject(new Error('Redis did not become ready for Calendar admission.'));
      }, 500);

      this.redis.once('ready', onReady);
    });

    this.connectionReady = connectionReady;

    try {
      await connectionReady;
    } finally {
      if (this.connectionReady === connectionReady) this.connectionReady = null;
    }
  }

  async release(lease: GoogleCalendarRequestLease): Promise<void> {
    try {
      const released: unknown = await this.redis.eval(
        RELEASE_GOOGLE_CALENDAR_REQUEST,
        lease.keys.length,
        ...lease.keys,
        lease.id,
      );

      if (released !== 1)
        throw new Error(
          'Google Calendar Redis request lease was not released.',
        );
    } catch (error: unknown) {
      this.logger.warn(
        `Google Calendar request lease release failed; its ${this.requestLeaseMs}ms expiry will recover the reserved capacity.`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
