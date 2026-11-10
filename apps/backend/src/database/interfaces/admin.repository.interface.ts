import type { PaginationInput } from '../../shared/pagination';
import type { ModelUsageKind } from './model-usage.repository.interface';

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
  paidUntil: Date | null;
  lastActivityAt: Date | null;
  activeSessions: number;
  storageBytes: number;
  llmCostUsd: number;
  usage: AdminUsageCounts;
  trialEndsAt: Date | null;
  plan: 'trial' | 'plus' | 'expired' | 'disabled';
  onboardingCompleted: boolean;
  acquisitionSource: string | null;
  channels: string[];
  payments: number;
  paymentTotalIdr: number;
  lastPaymentAt: Date | null;
  lastPaymentMethod: string | null;
  llmCost30DaysUsd: number;
  llmCost30DaysByKind: Array<{
    kind: ModelUsageKind;
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

export type AdminUsersInput = PaginationInput & {
  q?: string;
  status?: AdminUserStatus;
  plan?: 'trial' | 'plus' | 'expired';
  activity?: 'active' | 'inactive';
  attention?: 'trial-expiring' | 'plus-expiring';
  environment?: string;
  rolloutAt?: Date;
  /** `cost` orders by model spend in the last 30 days. */
  sort?: 'newest' | 'oldest' | 'activity' | 'cost';
};

export type AdminUsersPage = {
  items: AdminUser[];
  total: number;
  offset: number;
};

export interface IAdminRepository {
  giftPlus(input: AdminGiftPlusInput): Promise<AdminGiftPlusResult>;
  overview(now: Date): Promise<AdminOverview>;
  users(now: Date, input: AdminUsersInput): Promise<AdminUsersPage>;
  storageKeys(userId: string): Promise<string[]>;
  ban(userId: string, reason: string): Promise<boolean>;
  unban(userId: string): Promise<boolean>;
  revokeSessions(userId: string): Promise<void>;
  deleteUser(userId: string): Promise<boolean>;
}

export const ADMIN_REPOSITORY = Symbol('IAdminRepository');

export type AdminGiftPlusInput = {
  actorId: string;
  userId: string;
  durationDays: number;
  requestId: string;
  now: Date;
  rolloutAt: Date;
  trialDays: number;
};

export type AdminGiftPlusResult =
  { status: 'applied'; paidUntil: Date } | { status: 'not-found' | 'conflict' };
