export type AdminUserStatus = 'active' | 'banned';

export type AdminUsageCounts = {
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
  createdAt: Date;
  lastActivityAt: Date | null;
  activeSessions: number;
  storageBytes: number;
  llmCostUsd: number;
  usage: AdminUsageCounts;
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

export interface IAdminRepository {
  overview(now: Date): Promise<AdminOverview>;
  users(now: Date): Promise<AdminUser[]>;
  storageKeys(userId: string): Promise<string[]>;
  ban(userId: string, reason: string): Promise<boolean>;
  unban(userId: string): Promise<boolean>;
  revokeSessions(userId: string): Promise<void>;
  deleteUser(userId: string): Promise<boolean>;
}

export const ADMIN_REPOSITORY = Symbol('IAdminRepository');
