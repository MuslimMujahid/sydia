import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** ECB reference rates, published on business days; no key and no user data. */
export const USD_IDR_RATE_URL =
  'https://api.frankfurter.dev/v1/latest?base=USD&symbols=IDR';
/** Rupiah per US dollar before any live rate arrived, unless configured. */
export const DEFAULT_USD_IDR_RATE = 16_250;
/** A fetched rate is reused this long; ECB publishes once per business day. */
export const USD_IDR_REFRESH_MS = 12 * 3_600_000;
/** A failed fetch is not retried sooner than this. */
export const USD_IDR_RETRY_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 5_000;

export type UsdIdrRate = {
  rate: number;
  /** `ecb` for a fetched reference rate, `fallback` for the configured one. */
  source: 'ecb' | 'fallback';
  /** The business day the ECB rate is for, `YYYY-MM-DD`; null for the fallback. */
  date: string | null;
};

/**
 * The live USD→IDR rate for admin margins. Callers never wait on the network
 * once a rate is known: a stale rate is refreshed in the background. Before
 * the first successful fetch, the configured fallback is used and labelled.
 */
@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private latest: { rate: number; date: string; fetchedAt: number } | null =
    null;

  private lastAttemptAt = Number.NEGATIVE_INFINITY;
  private pending: Promise<void> | null = null;

  constructor(private readonly config: ConfigService) {}

  async usdIdr(): Promise<UsdIdrRate> {
    const now = Date.now();
    const stale =
      !this.latest || now - this.latest.fetchedAt >= USD_IDR_REFRESH_MS;

    if (stale && now - this.lastAttemptAt >= USD_IDR_RETRY_MS) {
      this.pending ??= this.refresh().finally(() => {
        this.pending = null;
      });
      // Only the first read waits; later ones keep the previous rate meanwhile.
      if (!this.latest) await this.pending;
    }

    return this.latest
      ? { rate: this.latest.rate, source: 'ecb', date: this.latest.date }
      : { rate: this.fallback(), source: 'fallback', date: null };
  }

  private fallback(): number {
    const rate = Number(this.config.get<string>('BACKEND_ADMIN_USD_IDR_RATE'));

    return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_USD_IDR_RATE;
  }

  private async refresh(): Promise<void> {
    this.lastAttemptAt = Date.now();

    try {
      const response = await fetch(USD_IDR_RATE_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const latest = parseRate(await response.json());
      this.latest = { ...latest, fetchedAt: Date.now() };
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'usd_idr_rate_fetch_failed',
          error: error instanceof Error ? error.message : String(error),
          using: this.latest ? 'previous-ecb-rate' : 'configured-fallback',
          remediation:
            'Admin margins keep the previous rate (or BACKEND_ADMIN_USD_IDR_RATE) and retry in 10 minutes.',
        }),
      );
    }
  }
}

function parseRate(body: unknown): { rate: number; date: string } {
  if (typeof body === 'object' && body !== null) {
    const { rates, date } = body as { rates?: unknown; date?: unknown };
    const rate =
      typeof rates === 'object' && rates !== null
        ? (rates as { IDR?: unknown }).IDR
        : undefined;

    if (
      typeof rate === 'number' &&
      Number.isFinite(rate) &&
      rate > 0 &&
      typeof date === 'string'
    )
      return { rate, date };
  }

  throw new Error('Unexpected rate response shape');
}
