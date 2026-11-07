import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ADMIN_ANALYTICS_REPOSITORY,
  type AdminDashboard,
  type AdminPeriod,
  type IAdminAnalyticsRepository,
} from '../../database/interfaces';

export const ADMIN_DASHBOARD_TTL_MS = 120_000;

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);
  private readonly cache = new Map<
    AdminPeriod,
    { expiresAt: number; value: AdminDashboard }
  >();

  private readonly pending = new Map<AdminPeriod, Promise<AdminDashboard>>();
  constructor(
    @Inject(ADMIN_ANALYTICS_REPOSITORY)
    private readonly analytics: IAdminAnalyticsRepository,
    private readonly config: ConfigService,
  ) {}

  private generation = 0;

  invalidate(): void {
    this.generation++;
    this.cache.clear();
    this.pending.clear();
  }

  async dashboard(period: AdminPeriod): Promise<AdminDashboard> {
    const now = new Date();
    const cached = this.cache.get(period);
    if (cached && cached.expiresAt > now.getTime()) return cached.value;
    const pending = this.pending.get(period);
    if (pending) return pending;
    const rollout = this.config.get<string>('BACKEND_BILLING_ROLLOUT_AT');
    const generation = this.generation;
    const operation = this.analytics.dashboard({
      now,
      period,
      environment: this.config.getOrThrow<string>('MAYAR_ENVIRONMENT'),
      rolloutAt: rollout ? new Date(rollout) : null,
    });

    this.pending.set(period, operation);

    try {
      const value = await operation;
      if (generation === this.generation)
        this.cache.set(period, {
          value,
          expiresAt: Date.now() + ADMIN_DASHBOARD_TTL_MS,
        });

      return value;
    } catch (error) {
      this.logger.error(
        `Admin dashboard ${period}-day aggregation failed`,
        error,
      );
      throw error;
    } finally {
      if (this.pending.get(period) === operation) this.pending.delete(period);
    }
  }
}
