import { useEffect, useState } from "react";
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import {
  getAdminOverview,
  getAdminUsers,
  updateAdminUser,
  giftAdminUserPlus,
} from "./admin.api";
import { billingKeys } from "../billing/billing.api";
import type {
  AdminUserAction,
  AdminUsersInput,
  AdminGiftPlusInput,
} from "@/components/admin/types";

export const adminQueryKeys = {
  all: ["admin"] as const,
  overview: () => ["admin", "overview"] as const,
  users: () => ["admin", "users"] as const,
  usersPage: (input: AdminUsersInput) => ["admin", "users", input] as const,
};

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
      invalidateQueries: [adminQueryKeys.overview(), adminQueryKeys.users()],
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
    meta: { invalidateQueries: [adminQueryKeys.users(), billingKeys.status] },
  });
}

export function useAdminUsersList() {
  const [input, setInput] = useState<AdminUsersInput>({
    offset: 0,
    limit: 25,
    q: "",
    status: "all",
  });

  const [search, setSearch] = useState("");
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
    onOffsetChange: (offset: number) =>
      setInput((current) => ({ ...current, offset })),
    onResetFilters: () => {
      setSearch("");
      setInput((current) => ({ ...current, q: "", status: "all", offset: 0 }));
    },
  };
}
