import { useEffect, useState } from "react";
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import {
  getAdminCosts,
  getAdminPricing,
  getAdminFeatureDetail,
  getAdminOverview,
  getAdminSummary,
  getAdminUsage,
  getAdminUserInsights,
  getAdminUsers,
  updateAdminUser,
  giftAdminUserPlus,
} from "./admin.api";
import { billingKeys } from "../billing/billing.api";
import type {
  ActivityFeature,
  AdminUserAction,
  AdminPeriod,
  AdminUsersInput,
  AdminGiftPlusInput,
} from "@/components/admin/types";

export const adminQueryKeys = {
  all: ["admin"] as const,
  /** Every analytics read; invalidated after admin actions. */
  analytics: () => ["admin", "analytics"] as const,
  summary: (period: AdminPeriod) =>
    ["admin", "analytics", "summary", period] as const,
  usage: (period: AdminPeriod) =>
    ["admin", "analytics", "usage", period] as const,
  feature: (period: AdminPeriod, feature: ActivityFeature) =>
    ["admin", "analytics", "feature", period, feature] as const,
  costs: (period: AdminPeriod) =>
    ["admin", "analytics", "costs", period] as const,
  userInsights: (period: AdminPeriod, userId: string) =>
    ["admin", "analytics", "user", period, userId] as const,
  overview: () => ["admin", "overview"] as const,
  pricing: () => ["admin", "pricing"] as const,
  users: () => ["admin", "users"] as const,
  usersPage: (input: AdminUsersInput) => ["admin", "users", input] as const,
};

// Matches the server cache: short periods change by the minute.
const analyticsRefreshMs = (period: AdminPeriod) =>
  period === "today" || period === "24h" ? 30_000 : 120_000;

const analytics = (period: AdminPeriod) => ({
  staleTime: analyticsRefreshMs(period),
  refetchInterval: analyticsRefreshMs(period),
  placeholderData: keepPreviousData,
});

export const adminSummaryQueryOptions = (period: AdminPeriod) =>
  queryOptions({
    queryKey: adminQueryKeys.summary(period),
    queryFn: () => getAdminSummary(period),
    ...analytics(period),
  });

export const adminUsageQueryOptions = (period: AdminPeriod) =>
  queryOptions({
    queryKey: adminQueryKeys.usage(period),
    queryFn: () => getAdminUsage(period),
    ...analytics(period),
  });

export const adminFeatureQueryOptions = (
  period: AdminPeriod,
  feature: ActivityFeature
) =>
  queryOptions({
    queryKey: adminQueryKeys.feature(period, feature),
    queryFn: () => getAdminFeatureDetail(period, feature),
    staleTime: analyticsRefreshMs(period),
  });

export const adminCostsQueryOptions = (period: AdminPeriod) =>
  queryOptions({
    queryKey: adminQueryKeys.costs(period),
    queryFn: () => getAdminCosts(period),
    ...analytics(period),
  });

export const adminUserInsightsQueryOptions = (
  period: AdminPeriod,
  userId: string
) =>
  queryOptions({
    queryKey: adminQueryKeys.userInsights(period, userId),
    queryFn: () => getAdminUserInsights(period, userId),
    staleTime: analyticsRefreshMs(period),
  });

/** Plus price and the live USD→IDR rate the backend refreshes twice a day. */
export const adminPricingQueryOptions = () =>
  queryOptions({
    queryKey: adminQueryKeys.pricing(),
    queryFn: getAdminPricing,
    staleTime: 10 * 60_000,
  });

export const adminOverviewQueryOptions = () =>
  queryOptions({
    queryKey: adminQueryKeys.overview(),
    queryFn: getAdminOverview,
    staleTime: 30_000,
  });

export const adminUsersQueryOptions = (input: AdminUsersInput) =>
  queryOptions({
    queryKey: adminQueryKeys.usersPage(input),
    queryFn: () => getAdminUsers(input),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

export function useAdminUserAction() {
  return useMutation({
    mutationFn: ({
      userId,
      action,
    }: {
      userId: string;
      action: AdminUserAction;
    }) => updateAdminUser(userId, action),
    meta: {
      invalidateQueries: [
        adminQueryKeys.overview(),
        adminQueryKeys.users(),
        adminQueryKeys.analytics(),
      ],
    },
  });
}

export function useAdminGiftPlus() {
  return useMutation({
    mutationFn: ({
      userId,
      input,
    }: {
      userId: string;
      input: AdminGiftPlusInput;
    }) => giftAdminUserPlus(userId, input),
    meta: {
      invalidateQueries: [
        adminQueryKeys.users(),
        adminQueryKeys.overview(),
        adminQueryKeys.analytics(),
        billingKeys.status,
      ],
    },
  });
}

export function useAdminUsersList(initial: Partial<AdminUsersInput> = {}) {
  const [input, setInput] = useState<AdminUsersInput>({
    offset: 0,
    limit: 25,
    q: "",
    status: "all",
    period: "7d",
    sort: "cost",
    ...initial,
  });

  const [search, setSearch] = useState(initial.q ?? "");
  useEffect(() => {
    const timeout = setTimeout(() => {
      setInput((current) =>
        current.q === search ? current : { ...current, q: search, offset: 0 }
      );
    }, 300);

    return () => clearTimeout(timeout);
  }, [search]);

  const query = useQuery(adminUsersQueryOptions(input));

  return {
    input,
    search,
    query,
    onSearchChange: setSearch,
    onStatusChange: (status: AdminUsersInput["status"]) =>
      setInput((current) => ({ ...current, status, offset: 0 })),
    onFiltersChange: (filters: Partial<AdminUsersInput>) =>
      setInput((current) => ({ ...current, ...filters, offset: 0 })),
    onOffsetChange: (offset: number) =>
      setInput((current) => ({ ...current, offset })),
    onResetFilters: () => {
      setSearch("");
      setInput((current) => ({
        ...current,
        q: "",
        status: "all",
        plan: undefined,
        activity: undefined,
        attention: undefined,
        sort: "cost",
        offset: 0,
      }));
    },
  };
}
