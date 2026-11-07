import type { AdminOverview } from './admin.repository.interface';

export type AdminPeriod = 7 | 30 | 90;
export type AdminMetric = { value: number; previous: number; series: number[] };
export type AdminDashboard = {
  generatedAt: string;
  from: string;
  until: string;
  period: AdminPeriod;
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
  daily: Array<{
    date: string;
    registrations: number;
    activeUsers: number;
    messages: number;
    costUsd: number;
  }>;
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

export type AdminAnalyticsInput = {
  now: Date;
  period: AdminPeriod;
  environment: string;
  rolloutAt: Date | null;
};

export interface IAdminAnalyticsRepository {
  dashboard(input: AdminAnalyticsInput): Promise<AdminDashboard>;
}

export const ADMIN_ANALYTICS_REPOSITORY = Symbol('IAdminAnalyticsRepository');
