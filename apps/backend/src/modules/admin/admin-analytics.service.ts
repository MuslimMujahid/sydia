import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ADMIN_ANALYTICS_REPOSITORY,
  type ActivityFeatureKey,
  type AdminAnalyticsInput,
  type AdminFeatureDetailData,
  type AdminPeriod,
  type AdminUserInsightsData,
  type IAdminAnalyticsRepository,
} from '../../database/interfaces';
import { ExchangeRateService } from '../../infra/exchange-rates';
import { BILLING_TERM_DAYS } from '../../shared/billing-policy';
import {
  buildCosts,
  buildSummary,
  buildUsage,
  type AdminCosts,
  type AdminPricing,
  type AdminSummary,
  type AdminUsage,
} from './admin-insights';

export const ADMIN_ANALYTICS_TTL_MS = 120_000;
/** Today and the last 24 hours change by the minute, so they are reused briefly. */
export const ADMIN_ANALYTICS_SHORT_TTL_MS = 30_000;

/**
 * Reads the admin analytics with a short per-request cache: several admins
 * opening a page share one aggregation, and concurrent reads of the same key
 * share one query.
 */
@Injectable()
export class AdminAnalyticsService {
  private readonly logger = new Logger(AdminAnalyticsService.name);
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: unknown }
  >();

  private readonly pending = new Map<string, Promise<unknown>>();
  private generation = 0;

  constructor(
    @Inject(ADMIN_ANALYTICS_REPOSITORY)
    private readonly analytics: IAdminAnalyticsRepository,
    private readonly config: ConfigService,
    private readonly rates: ExchangeRateService,
  ) {}

  /** Drops cached reads after an admin action changed accounts or billing. */
  invalidate(): void {
    this.generation++;
    this.cache.clear();
    this.pending.clear();
  }

  summary(period: AdminPeriod): Promise<AdminSummary> {
    return this.cached(`summary:${period}`, period, async (input) =>
      buildSummary(await this.analytics.summary(input)),
    );
  }

  usage(period: AdminPeriod): Promise<AdminUsage> {
    return this.cached(`usage:${period}`, period, async (input) =>
      buildUsage(await this.analytics.usage(input)),
    );
  }

  feature(
    period: AdminPeriod,
    feature: ActivityFeatureKey,
  ): Promise<AdminFeatureDetailData> {
    return this.cached(`feature:${period}:${feature}`, period, (input) =>
      this.analytics.featureDetail({ ...input, feature }),
    );
  }

  costs(period: AdminPeriod): Promise<AdminCosts> {
    return this.cached(`costs:${period}`, period, async (input) =>
      buildCosts(await this.analytics.costs(input), await this.pricing()),
    );
  }

  userInsights(
    period: AdminPeriod,
    userId: string,
  ): Promise<AdminUserInsightsData | null> {
    return this.cached(`user:${period}:${userId}`, period, (input) =>
      this.analytics.userInsights({ ...input, userId }),
    );
  }

  async pricing(): Promise<AdminPricing> {
    const rate = await this.rates.usdIdr();

    return {
      plusPriceIdr: Number(
        this.config.get<number>('BACKEND_BILLING_PRICE_IDR') ?? 29_000,
      ),
      termDays: BILLING_TERM_DAYS,
      usdIdrRate: rate.rate,
      rateSource: rate.source,
      rateDate: rate.date,
    };
  }

  private async cached<T>(
    key: string,
    period: AdminPeriod,
    load: (input: AdminAnalyticsInput) => Promise<T>,
  ): Promise<T> {
    const now = new Date();
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > now.getTime()) return hit.value as T;
    const running = this.pending.get(key);
    if (running) return running as Promise<T>;

    const rollout = this.config.get<string>('BACKEND_BILLING_ROLLOUT_AT');
    const generation = this.generation;
    const operation = load({
      now,
      period,
      environment: this.config.getOrThrow<string>('MAYAR_ENVIRONMENT'),
      rolloutAt: rollout ? new Date(rollout) : null,
    });

    this.pending.set(key, operation);

    try {
      const value = await operation;
      if (generation === this.generation)
        this.cache.set(key, {
          value,
          expiresAt:
            Date.now() +
            (period === 'today' || period === '24h'
              ? ADMIN_ANALYTICS_SHORT_TTL_MS
              : ADMIN_ANALYTICS_TTL_MS),
        });

      return value;
    } catch (error) {
      this.logger.error(`Admin analytics ${key} aggregation failed`, error);
      throw error;
    } finally {
      if (this.pending.get(key) === operation) this.pending.delete(key);
    }
  }
}
