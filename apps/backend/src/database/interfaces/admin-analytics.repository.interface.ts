import type { UsageFeature } from '../../shared/activity/usage-features';

export type AdminPeriod = 'today' | '24h' | '7d' | '30d' | '90d';
export const ADMIN_PERIODS: readonly AdminPeriod[] = [
  'today',
  '24h',
  '7d',
  '30d',
  '90d',
];
export type AdminBucket = 'hour' | 'day';

/** Features a user acts in; chat counts their own messages. */
export const ACTIVITY_FEATURES = [
  'chat',
  'notes',
  'memory',
  'tasks',
  'reminders',
  'documents',
  'calendar',
  'contacts',
] as const;
export type ActivityFeatureKey = (typeof ACTIVITY_FEATURES)[number];

export type FeatureCosts = Partial<Record<UsageFeature, number>>;
export type FeatureCounts = Partial<Record<ActivityFeatureKey, number>>;

/** The reporting window every analytics read shares. */
export type AdminWindow = {
  generatedAt: string;
  from: string;
  until: string;
  period: AdminPeriod;
  bucket: AdminBucket;
  timezone: string;
  /** Bucket starts in Asia/Jakarta, ISO 8601 with offset. */
  buckets: string[];
};

export type AdminTotals = {
  activeUsers: number;
  messages: number;
  costUsd: number;
  interactiveUsd: number;
  backgroundUsd: number;
  wastedUsd: number;
  revenueIdr: number;
  payments: number;
  inputTokens: number;
  cachedInputTokens: number;
  unpricedCalls: number;
};

/** One user's activity and spend in the current and previous windows. */
export type AdminUserActivity = {
  userId: string;
  name: string;
  email: string;
  plan: 'trial' | 'plus' | 'expired' | 'disabled';
  actions: number;
  previousActions: number;
  activeDays: number;
  costUsd: number;
  previousCostUsd: number;
  backgroundUsd: number;
  /** Feature whose spend grew most against the previous window. */
  growthFeature: UsageFeature | null;
  firstMessageAt: string | null;
};

export type AdminSummaryData = AdminWindow & {
  totalAccounts: number;
  current: AdminTotals;
  previous: AdminTotals;
  /** Per bucket, aligned with `buckets`. */
  series: {
    activeUsers: number[];
    messages: number[];
    costUsd: number[];
    interactiveUsd: number[];
    backgroundUsd: number[];
    revenueIdr: number[];
    featureCosts: FeatureCosts[];
  };
  /** Middle half of the 7 days before at the same hour; hourly periods only. */
  normal: Array<{
    messages: [number, number];
    costUsd: [number, number];
  }> | null;
  featureCosts: { current: FeatureCosts; previous: FeatureCosts };
  users: AdminUserActivity[];
  wastedTopStage: string | null;
  runs: {
    failed: number;
    total: number;
    lastFailedAt: string | null;
    lastError: string | null;
  };
  failures: Array<{
    id: string;
    model: string;
    createdAt: string;
    errorMessage: string | null;
  }>;
  expiring: { trials: number; activeTrials: number; plus: number };
  channels: Array<{ channel: string; messages: number; users: number }>;
  newAccounts: Array<{
    id: string;
    name: string;
    email: string;
    createdAt: string;
    source: string | null;
    onboardingCompleted: boolean;
    messages: number;
    features: number;
  }>;
};

export type AdminUsageData = AdminWindow & {
  totalAccounts: number;
  /** Accounts that acted before the window but not in it. */
  dormantAccounts: number;
  /** Accounts that never sent a message. */
  neverActiveAccounts: number;
  users: Array<{
    userId: string;
    name: string;
    email: string;
    plan: AdminUserActivity['plan'];
    activeDays: number;
    actions: FeatureCounts;
    costUsd: number;
    /** The user's spend per usage feature. */
    costs: FeatureCosts;
    /** Actions per window bucket. */
    activity: number[];
  }>;
  features: Array<{
    feature: ActivityFeatureKey;
    users: number;
    actions: number;
    /** Users of the feature who used it on at least two days. */
    returning: number;
    perUser: number[];
    series: number[];
  }>;
  featureCosts: FeatureCosts;
  pooledMemoryUsd: number;
};

export type AdminFeatureDetailData = AdminWindow & {
  feature: ActivityFeatureKey;
  sources: Array<{
    stage: string;
    kind: string;
    calls: number;
    retried: number;
    costUsd: number;
  }>;
  series: number[];
  users: Array<{
    userId: string;
    name: string;
    actions: number;
    activeDays: number;
    costUsd: number;
  }>;
};

export type AdminProcess = {
  stage: string;
  feature: UsageFeature;
  kind: string;
  calls: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  wastedUsd: number;
  retried: number;
  failed: number;
  unpriced: number;
  models: Array<{
    model: string;
    retry: boolean;
    calls: number;
    costUsd: number;
  }>;
  accounts: Array<{ userId: string; name: string; costUsd: number }>;
};

export type AdminCostsData = AdminWindow & {
  current: AdminTotals;
  previous: AdminTotals;
  series: { featureCosts: FeatureCosts[] };
  featureCosts: { current: FeatureCosts; previous: FeatureCosts };
  processes: AdminProcess[];
  users: Array<{
    userId: string;
    name: string;
    plan: AdminUserActivity['plan'];
    actions: number;
    costUsd: number;
    backgroundUsd: number;
    featureActions: FeatureCounts;
  }>;
  unattributedUsd: number;
  pooledMemoryUsd: number;
  models: Array<{ model: string; costUsd: number }>;
};

export type AdminUserInsightsData = AdminWindow & {
  userId: string;
  series: Array<{ actions: FeatureCounts; costUsd: number }>;
  features: Array<{
    feature: UsageFeature;
    actions: number;
    costUsd: number;
  }>;
  interactiveUsd: number;
  backgroundUsd: number;
  previousActions: number;
  activeDays: number;
  conversations: Array<{
    id: string;
    title: string | null;
    lastMessageAt: string;
    messages: number;
    toolSteps: number;
    costUsd: number;
  }>;
};

export type AdminAnalyticsInput = {
  now: Date;
  period: AdminPeriod;
  environment: string;
  rolloutAt: Date | null;
};

export interface IAdminAnalyticsRepository {
  summary(input: AdminAnalyticsInput): Promise<AdminSummaryData>;
  usage(input: AdminAnalyticsInput): Promise<AdminUsageData>;
  featureDetail(
    input: AdminAnalyticsInput & { feature: ActivityFeatureKey },
  ): Promise<AdminFeatureDetailData>;
  costs(input: AdminAnalyticsInput): Promise<AdminCostsData>;
  userInsights(
    input: AdminAnalyticsInput & { userId: string },
  ): Promise<AdminUserInsightsData | null>;
}

export const ADMIN_ANALYTICS_REPOSITORY = Symbol('IAdminAnalyticsRepository');
