import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_USD_IDR_RATE,
  ExchangeRateService,
  USD_IDR_REFRESH_MS,
  USD_IDR_RETRY_MS,
  USD_IDR_RATE_URL,
} from './exchange-rate.service';

const ecb = (rate: number, date = '2026-11-13') =>
  new Response(
    JSON.stringify({ amount: 1, base: 'USD', date, rates: { IDR: rate } }),
  );

function setup(config: Record<string, string> = {}) {
  let now = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);

  return {
    service: new ExchangeRateService(new ConfigService(config)),
    fetch: jest.spyOn(globalThis, 'fetch'),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ExchangeRateService', () => {
  test('returns the ECB rate and reuses it until it goes stale', async () => {
    const { service, fetch, advance } = setup();
    fetch.mockResolvedValueOnce(ecb(18_245));

    await expect(service.usdIdr()).resolves.toEqual({
      rate: 18_245,
      source: 'ecb',
      date: '2026-11-13',
    });
    advance(USD_IDR_REFRESH_MS - 1);
    await service.usdIdr();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(USD_IDR_RATE_URL, expect.anything());
  });

  test('serves the previous rate while a stale one refreshes in the background', async () => {
    const { service, fetch, advance } = setup();
    fetch.mockResolvedValueOnce(ecb(18_245));
    await service.usdIdr();

    let resolve: (response: Response) => void = () => undefined;
    fetch.mockReturnValueOnce(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    advance(USD_IDR_REFRESH_MS);

    await expect(service.usdIdr()).resolves.toMatchObject({ rate: 18_245 });
    resolve(ecb(18_300, '2026-11-14'));
    await new Promise((done) => setImmediate(done));

    await expect(service.usdIdr()).resolves.toEqual({
      rate: 18_300,
      source: 'ecb',
      date: '2026-11-14',
    });
  });

  test('falls back to the configured rate, labelled, until a fetch succeeds', async () => {
    const { service, fetch, advance } = setup({
      BACKEND_ADMIN_USD_IDR_RATE: '18000',
    });

    fetch.mockRejectedValueOnce(new Error('offline'));

    await expect(service.usdIdr()).resolves.toEqual({
      rate: 18_000,
      source: 'fallback',
      date: null,
    });
    // A failure is not retried on every read.
    await service.usdIdr();
    expect(fetch).toHaveBeenCalledTimes(1);

    advance(USD_IDR_RETRY_MS);
    fetch.mockResolvedValueOnce(ecb(18_245));
    await expect(service.usdIdr()).resolves.toMatchObject({ source: 'ecb' });
  });

  test('rejects an unexpected response instead of using it', async () => {
    const { service, fetch } = setup();
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ rates: { IDR: 'n/a' } })),
    );

    await expect(service.usdIdr()).resolves.toEqual({
      rate: DEFAULT_USD_IDR_RATE,
      source: 'fallback',
      date: null,
    });
  });

  test('treats an HTTP error as a failed fetch', async () => {
    const { service, fetch } = setup();
    fetch.mockResolvedValueOnce(new Response('busy', { status: 503 }));

    await expect(service.usdIdr()).resolves.toMatchObject({
      source: 'fallback',
    });
  });
});
