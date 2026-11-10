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
};

export type AdminPeriod = "today" | "24h" | "7d" | "30d" | "90d";
export type AdminBucket = "hour" | "day";
/** What a model call was spent on. */
export type AdminCostKind = "message" | "background" | "hindsight" | "other";
export type AdminCosts = {
  byKind: Array<{ kind: AdminCostKind; costUsd: number; calls: number }>;
  breakdown: Array<{
    kind: AdminCostKind;
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
  unattributedUsd: number;
  failedUsd: number;
  unpricedCalls: number;
  trackedSince: string | null;
  hindsightTracked: boolean;
};
export type AdminMetric = { value: number; previous: number; series: number[] };
export type AdminDashboard = {
  generatedAt: string;
  from: string;
  until: string;
  period: AdminPeriod;
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
