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
  sort?: "newest" | "oldest" | "activity";
};

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
