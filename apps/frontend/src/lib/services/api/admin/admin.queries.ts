import { useEffect, useState } from "react";
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import {
  getAdminOverview,
  getAdminDashboard,
  getAdminUsers,
  updateAdminUser,
  giftAdminUserPlus,
} from "./admin.api";
import { billingKeys } from "../billing/billing.api";
import type {
  AdminUserAction,
  AdminPeriod,
  AdminUsersInput,
  AdminGiftPlusInput,
} from "@/components/admin/types";

export const adminQueryKeys = {
  all: ["admin"] as const,
  dashboards: () => ["admin", "dashboard"] as const,
  dashboard: (period: AdminPeriod) => ["admin", "dashboard", period] as const,
  overview: () => ["admin", "overview"] as const,
  users: () => ["admin", "users"] as const,
  usersPage: (input: AdminUsersInput) => ["admin", "users", input] as const,
};

export const adminDashboardQueryOptions = (period: AdminPeriod) =>
  queryOptions({
    queryKey: adminQueryKeys.dashboard(period),
    queryFn: () => getAdminDashboard(period),
    staleTime: 120_000,
    refetchInterval: 120_000,
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
        adminQueryKeys.dashboards(),
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
        adminQueryKeys.dashboards(),
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
        sort: "newest",
        offset: 0,
      }));
    },
  };
}
