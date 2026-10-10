import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import {
  GoogleCalendarAdmissionUnavailableError,
  GoogleCalendarRequestDeferredError,
  GoogleCalendarRequestLimiter,
  type GoogleCalendarRequestContext,
  type GoogleCalendarRequestLease,
} from './google-calendar-request-limiter.service.js';

const redisUrl = process.env.CALENDAR_SYNC_REDIS_CONTRACT_URL;
if (redisUrl && new URL(redisUrl).pathname !== '/15')
  throw new Error(
    'Calendar sync Redis contracts require dedicated database 15',
  );

const live = redisUrl ? describe : describe.skip;

live('Google Calendar shared Redis admission contract', () => {
  let firstWorker: GoogleCalendarRequestLimiter;
  let secondWorker: GoogleCalendarRequestLimiter;
  const outbound: GoogleCalendarRequestContext = {
    googleSubject: 'verified-contract-subject',
    calendarId: 'contract-calendar',
    lane: 'outbound',
  };

  beforeAll(() => {
    const config = new ConfigService({
      BACKEND_REDIS_URL: redisUrl,
      BACKEND_GOOGLE_CLIENT_ID: 'calendar-contract-client',
      BACKEND_GOOGLE_CALENDAR_PROJECT_CONCURRENCY: '20',
      BACKEND_GOOGLE_CALENDAR_USER_CONCURRENCY: '20',
      BACKEND_GOOGLE_CALENDAR_ID_CONCURRENCY: '20',
      BACKEND_GOOGLE_CALENDAR_PROJECT_BURST: '1000',
      BACKEND_GOOGLE_CALENDAR_USER_BURST: '1000',
      BACKEND_GOOGLE_CALENDAR_ID_BURST: '1000',
    });

    firstWorker = new GoogleCalendarRequestLimiter(config);
    secondWorker = new GoogleCalendarRequestLimiter(config);
  });

  afterAll(() => {
    firstWorker?.onModuleDestroy();
    secondWorker?.onModuleDestroy();
  });

  test('shares lane capacity across workers while reserving capacity for interactive requests', async () => {
    const leases: GoogleCalendarRequestLease[] = [];

    try {
      for (let index = 0; index < 8; index += 1) {
        const worker = index % 2 === 0 ? firstWorker : secondWorker;
        leases.push(await worker.acquire(outbound));
      }

      await expect(secondWorker.acquire(outbound)).rejects.toBeInstanceOf(
        GoogleCalendarRequestDeferredError,
      );

      const interactive = await secondWorker.acquire({
        ...outbound,
        lane: 'interactive',
      });

      leases.push(interactive);
    } finally {
      await Promise.all(leases.map((lease) => firstWorker.release(lease)));
    }

    const afterRelease = await secondWorker.acquire(outbound);
    await secondWorker.release(afterRelease);
  });

  test('fails closed within a bounded wait when Redis cannot be reached', async () => {
    if (!redisUrl)
      throw new Error('Redis contract URL is required for this live suite.');

    const unavailableUrl = new URL(redisUrl);
    unavailableUrl.hostname = '127.0.0.1';
    unavailableUrl.port = '1';
    unavailableUrl.username = '';
    unavailableUrl.password = '';
    const unavailableWorker = new GoogleCalendarRequestLimiter(
      new ConfigService({
        BACKEND_REDIS_URL: unavailableUrl.toString(),
        BACKEND_GOOGLE_CLIENT_ID: 'calendar-contract-unreachable-client',
      }),
    );

    const startedAt = Date.now();

    try {
      await expect(unavailableWorker.acquire(outbound)).rejects.toBeInstanceOf(
        GoogleCalendarAdmissionUnavailableError,
      );
      expect(Date.now() - startedAt).toBeLessThan(1_500);
    } finally {
      unavailableWorker.onModuleDestroy();
    }
  });
});
