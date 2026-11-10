import type { AdminOverview } from './admin.repository.interface';
import type { ModelUsageKind } from './model-usage.repository.interface';

export type AdminPeriod = 'today' | '24h' | '7d' | '30d' | '90d';
export const ADMIN_PERIODS: readonly AdminPeriod[] = [
  'today',
  '24h',
  '7d',
  '30d',
  '90d',
];
export type AdminBucket = 'hour' | 'day';
export type AdminMetric = { value: number; previous: number; series: number[] };
export type AdminDashboard = {
  generatedAt: string;
  from: string;
  until: string;
  period: AdminPeriod;
  /** Size of each `timeline` entry and metric series point. */
  bucket: AdminBucket;
  timezone: string;
  environment: string;
  overview: AdminOverview;
  metrics: {
    registrations: AdminMetric;
    activeUsers: AdminMetric;
    conversion: AdminMetric & { converted: number; trials: number };
    revenue: AdminMetric & { payments: number };
    cost: AdminMetric;
    reliability: AdminMetric & { completed: number; failed: number };
  };
  attention: {
    failedRuns: number;
    totalRuns: number;
    expiringTrials: number;
    expiringPlus: number;
    activeExpiringTrials: number;
  };
  failures: Array<{
    id: string;
    model: string;
    createdAt: string;
    errorMessage: string | null;
  }>;
  timeline: Array<{
    /** Bucket start in Asia/Jakarta, ISO 8601 with offset. */
    start: string;
    registrations: number;
    activeUsers: number;
    messages: number;
    costUsd: number;
  }>;
  costs: AdminCosts;
  channels: Array<{ channel: string; messages: number }>;
  adoption: Array<{ feature: string; users: number }>;
  acquisition: Array<{ source: string; users: number; converted: number }>;
  models: Array<{ model: string; costUsd: number }>;
  recentUsers: Array<{
    id: string;
    name: string;
    email: string;
    createdAt: string;
    plan: string;
    onboardingCompleted: boolean;
  }>;
};

export type AdminCosts = {
  byKind: Array<{ kind: ModelUsageKind; costUsd: number; calls: number }>;
  breakdown: Array<{
    kind: ModelUsageKind;
    job: string | null;
    stage: string;
    costUsd: number;
    calls: number;
    failedCalls: number;
    unpricedCalls: number;
  }>;
  topAccounts: Array<{
    userId: string;
    name: string;
    email: string;
    costUsd: number;
    calls: number;
    messages: number;
  }>;
  /** Spend with no account: system jobs and deleted accounts, not Hindsight. */
  unattributedUsd: number;
  /** Spend of failed attempts and retries, included in the total. */
  failedUsd: number;
  /** Calls whose provider reported no cost, or only part of it. */
  unpricedCalls: number;
  /** When every call started being recorded; earlier periods hold reply costs only. */
  trackedSince: string | null;
  /** Whether Hindsight's dedicated OpenRouter key is polled for its spend. */
  hindsightTracked: boolean;
};

export type AdminAnalyticsInput = {
  now: Date;
  period: AdminPeriod;
  environment: string;
  rolloutAt: Date | null;
};

export interface IAdminAnalyticsRepository {
  dashboard(input: AdminAnalyticsInput): Promise<
    Omit<AdminDashboard, 'costs'> & {
      costs: Omit<AdminCosts, 'hindsightTracked'>;
    }
  >;
}

export const ADMIN_ANALYTICS_REPOSITORY = Symbol('IAdminAnalyticsRepository');
