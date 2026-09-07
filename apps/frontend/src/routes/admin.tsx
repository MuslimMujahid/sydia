import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminPage } from "@/components/admin/admin-page";
import { AdminShell } from "@/components/admin/admin-shell";
import type {
  AdminOverview,
  AdminUser,
  AdminUserAction,
} from "@/components/admin/types";
import { requireAdminSession } from "@/lib/auth";
import {
  adminOverviewQueryOptions,
  adminUsersQueryOptions,
  useAdminUserAction,
} from "@/lib/services/api/admin/admin.queries";

export const Route = createFileRoute("/admin")({
  beforeLoad: ({ context, location }) =>
    requireAdminSession(context.queryClient, location.href),
  head: () => ({
    meta: [
      { title: "Pengguna · Sydia Admin" },
      {
        name: "description",
        content: "Kelola pengguna, sesi, dan penggunaan Sydia.",
      },
    ],
  }),
  component: AdminRoute,
});

function AdminRoute() {
  const admin = Route.useRouteContext();
  const overviewQuery = useQuery(adminOverviewQueryOptions());
  const usersQuery = useQuery(adminUsersQueryOptions());
  const actionMutation = useAdminUserAction();
  const overview: AdminOverview = overviewQuery.data ?? {
    totalUsers: 0,
    activeUsers: 0,
    bannedUsers: 0,
    activeSessions: 0,
    storageBytes: 0,
    llmCostUsd: 0,
    llmCostBreakdown: [],
  };

  const users: AdminUser[] = usersQuery.data ?? [];

  async function act(user: AdminUser, action: AdminUserAction) {
    await actionMutation.mutateAsync({ userId: user.id, action });
  }

  return (
    <AdminShell user={admin}>
      <AdminPage
        overview={overview}
        users={users}
        isLoading={overviewQuery.isPending || usersQuery.isPending}
        error={
          overviewQuery.error?.message ?? usersQuery.error?.message ?? null
        }
        onRetry={() => {
          void Promise.all([overviewQuery.refetch(), usersQuery.refetch()]);
        }}
        onBanUser={(user) => act(user, "ban")}
        onUnbanUser={(user) => act(user, "unban")}
        onForceSignOutUser={(user) => act(user, "force-sign-out")}
        onDeleteUser={(user) => act(user, "delete")}
      />
    </AdminShell>
  );
}
