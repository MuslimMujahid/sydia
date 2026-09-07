import { queryOptions, useMutation } from "@tanstack/react-query";
import { getAdminOverview, getAdminUsers, updateAdminUser } from "./admin.api";
import type { AdminUserAction } from "@/components/admin/types";

export const adminQueryKeys = {
  all: ["admin"] as const,
  overview: () => ["admin", "overview"] as const,
  users: () => ["admin", "users"] as const,
};

export const adminOverviewQueryOptions = () =>
  queryOptions({
    queryKey: adminQueryKeys.overview(),
    queryFn: getAdminOverview,
    staleTime: 30_000,
  });

export const adminUsersQueryOptions = () =>
  queryOptions({
    queryKey: adminQueryKeys.users(),
    queryFn: getAdminUsers,
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
