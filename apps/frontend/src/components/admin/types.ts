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
  lastActivityAt: string | null;
  activeSessions: number;
  storageBytes: number;
  llmCostUsd: number;
  usage: AdminUsage;
};

export type AdminOverview = {
  totalUsers: number;
  activeUsers: number;
  bannedUsers: number;
  activeSessions: number;
  storageBytes: number;
  llmCostUsd: number;
  llmCostBreakdown: Array<{ model: string; costUsd: number }>;
};

export type AdminUserAction = "ban" | "unban" | "force-sign-out" | "delete";
