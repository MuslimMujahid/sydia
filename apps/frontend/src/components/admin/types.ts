export type AdminUserStatus = "active" | "banned";

export type AdminUsage = {
  conversations: number;
  documents: number;
  memories: number;
  reminders: number;
  tasks: number;
  contacts: number;
  events: number;
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  status: AdminUserStatus;
  createdAt: string;
  paidUntil: string | null;
  lastActivityAt: string | null;
  activeSessions: number;
  storageBytes: number;
  llmCostUsd: number;
  usage: AdminUsage;
  trialEndsAt: string | null;
  plan: "trial" | "plus" | "expired" | "disabled";
  onboardingCompleted: boolean;
  acquisitionSource: string | null;
  channels: string[];
  payments: number;
  paymentTotalIdr: number;
  lastPaymentAt: string | null;
  lastPaymentMethod: string | null;
  llmCost30DaysUsd: number;
  llmCost30DaysByKind: Array<{
    kind: AdminCostKind;
    costUsd: number;
    calls: number;
  }>;
  /** Actions per bucket of the requested period. */
  periodActivity: number[];
  periodActions: number;
  periodActiveDays: number;
  periodFeatures: number;
  periodCostUsd: number;
};

export type AdminOverview = {
  totalUsers: number;
  activeUsers: number;
  allowedUsers: number;
  subscribedUsers: number;
  bannedUsers: number;
  activeSessions: number;
  storageBytes: number;
  llmCostUsd: number;
  llmCostBreakdown: Array<{ model: string; costUsd: number }>;
};

export type AdminUserAction = "ban" | "unban" | "force-sign-out" | "delete";

export type AdminGiftPlusInput = { durationDays: number; requestId: string };
export type AdminGiftPlusResult = { paidUntil: string };
export type OnGiftPlus = (
  user: AdminUser,
  input: AdminGiftPlusInput
) => Promise<AdminGiftPlusResult>;

export type AdminUsersInput = {
  offset: number;
  limit: number;
  q: string;
  status: AdminUserStatus | "all";
  plan?: "trial" | "plus" | "expired";
  activity?: "active" | "inactive";
  attention?: "trial-expiring" | "plus-expiring";
  sort?: "newest" | "oldest" | "activity" | "cost";
  period?: AdminPeriod;
};

export type AdminPeriod = "today" | "24h" | "7d" | "30d" | "90d";
export type AdminBucket = "hour" | "day";
/** What a model call was spent on. */
export type AdminCostKind = "message" | "background" | "hindsight" | "other";

/** Product features spend is attributed to (mirrors the backend ledger). */
export type UsageFeature =
  | "chat"
  | "notes"
  | "memory"
  | "tasks"
  | "reminders"
  | "documents"
  | "calendar"
  | "contacts"
  | "proactive"
  | "overhead"
  | "other";
/** Features a user acts in; chat counts their own messages. */
export type ActivityFeature = Extract<
  UsageFeature,
  | "chat"
  | "notes"
  | "memory"
  | "tasks"
  | "reminders"
  | "documents"
  | "calendar"
  | "contacts"
>;
export type FeatureCosts = Partial<Record<UsageFeature, number>>;
export type FeatureCounts = Partial<Record<ActivityFeature, number>>;
export type AdminPlan = "trial" | "plus" | "expired" | "disabled";

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

export type AdminAttention =
  | {
      kind: "cost-outpacing";
      costChange: number;
      messageChange: number | null;
      drivers: Array<{ feature: UsageFeature; deltaUsd: number }>;
    }
  | {
      kind: "user-leak";
      userId: string;
      name: string;
      costUsd: number;
      actions: number;
      multiple: number;
      backgroundShare: number;
    }
  | { kind: "wasted"; costUsd: number; share: number; topStage: string | null }
  | {
      kind: "failed-runs";
      failed: number;
      total: number;
      lastFailedAt: string | null;
      lastError: string | null;
    }
  | { kind: "expiring-trials"; count: number; active: number }
  | { kind: "expiring-plus"; count: number };

export type AdminMover = {
  userId: string;
  name: string;
  kind: "cost" | "actions" | "new";
  delta: number;
  feature: UsageFeature | null;
  actions: number;
  previousActions: number;
  activeDays: number;
};

export type AdminSummary = AdminWindow & {
  totalAccounts: number;
  current: AdminTotals;
  previous: AdminTotals;
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
  typicalCostPerAction: number | null;
  attention: AdminAttention[];
  movers: AdminMover[];
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

export type AdminUserGroup = "power" | "regular" | "casual";

export type AdminUsageReport = AdminWindow & {
  totalAccounts: number;
  dormantAccounts: number;
  neverActiveAccounts: number;
  /** Days the window covers; hourly windows count as one. */
  days: number;
  groups: Record<AdminUserGroup | "dormant" | "inactive", number>;
  typicalCostPerAction: number | null;
  users: Array<{
    userId: string;
    name: string;
    email: string;
    plan: AdminPlan;
    activeDays: number;
    actions: FeatureCounts;
    costUsd: number;
    /** Spend per usage feature. */
    costs: FeatureCosts;
    /** Actions per window bucket. */
    activity: number[];
    group: AdminUserGroup;
    /** Spend against the typical cost of the same number of actions. */
    multiple: number | null;
    leak: boolean;
  }>;
  features: Array<{
    feature: ActivityFeature;
    users: number;
    actions: number;
    /** Users of the feature who used it on at least two days. */
    returning: number;
    /** Actions per user, ascending (for medians). */
    perUser: number[];
    series: number[];
  }>;
  featureCosts: FeatureCosts;
  pooledMemoryUsd: number;
};

export type AdminFeatureDetail = AdminWindow & {
  feature: ActivityFeature;
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

export type AdminPricing = {
  plusPriceIdr: number;
  termDays: number;
  usdIdrRate: number;
};

export type AdminCostReport = AdminWindow & {
  current: AdminTotals;
  previous: AdminTotals;
  series: { featureCosts: FeatureCosts[] };
  featureCosts: { current: FeatureCosts; previous: FeatureCosts };
  processes: AdminProcess[];
  typicalCostPerAction: number | null;
  pricing: AdminPricing;
  users: Array<{
    userId: string;
    name: string;
    plan: AdminPlan;
    actions: number;
    costUsd: number;
    backgroundUsd: number;
    featureActions: FeatureCounts;
    /** Spend as a multiple of the typical cost of the same actions. */
    multiple: number | null;
    leak: boolean;
  }>;
  unattributedUsd: number;
  pooledMemoryUsd: number;
  models: Array<{ model: string; costUsd: number }>;
};

export type AdminUserInsights = AdminWindow & {
  userId: string;
  series: Array<{ actions: FeatureCounts; costUsd: number }>;
  features: Array<{ feature: UsageFeature; actions: number; costUsd: number }>;
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

/** What a route hands an analytics page: the read and its period control. */
export type AnalyticsPageProps<T> = {
  period: AdminPeriod;
  onPeriodChange: (period: AdminPeriod) => void;
  /** Last successful read, kept while a newer one loads or fails. */
  data: T | undefined;
  error: Error | null;
  isFetching: boolean;
  onRetry: () => void;
};
