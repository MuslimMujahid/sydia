import { useCallback, useState } from "react";
import type { AdminPeriod, OnGiftPlus } from "../src/components/admin/types";
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { AdminShell } from "../src/components/admin/admin-shell";
import type { UserProfile } from "../src/lib/services/api/users/users.queries";
import { QueryClientProvider } from "@tanstack/react-query";
import { AdminPage } from "../src/components/admin/admin-page";
import {
  useAdminUsersList,
  useAdminGiftPlus,
} from "../src/lib/services/api/admin/admin.queries";
import "../src/styles/globals.css";
import { createQueryClient } from "../src/lib/query-client";

const client = createQueryClient();
client.setDefaultOptions({ queries: { retry: false } });

// `?user=<id>` opens the drawer on load, like a link from Ringkasan.
const initialUser = new URLSearchParams(window.location.search).get("user");

function AdminFixture() {
  const list = useAdminUsersList();
  const [period, setPeriod] = useState<AdminPeriod>("7d");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(
    initialUser
  );

  const { mutateAsync: giftPlus } = useAdminGiftPlus();
  const handleGiftPlus = useCallback<OnGiftPlus>(
    (user, input) => giftPlus({ userId: user.id, input }),
    [giftPlus]
  );

  return (
    <>
      <AdminPage
        overview={{
          totalUsers: 51,
          activeUsers: 12,
          allowedUsers: 50,
          subscribedUsers: 8,
          bannedUsers: 1,
          activeSessions: 0,
          storageBytes: 0,
          llmCostUsd: 0,
          llmCostBreakdown: [],
        }}
        period={period}
        onPeriodChange={(next) => {
          setPeriod(next);
          list.onFiltersChange({ period: next });
        }}
        selectedUserId={selectedUserId}
        onSelectUser={setSelectedUserId}
        users={list.query.data?.data ?? []}
        pagination={
          list.query.data?.pagination ?? { offset: 0, limit: 25, total: 0 }
        }
        query={list.search}
        statusFilter={list.input.status}
        filters={list.input}
        onFiltersChange={list.onFiltersChange}
        onQueryChange={list.onSearchChange}
        onStatusChange={list.onStatusChange}
        onOffsetChange={list.onOffsetChange}
        onResetFilters={list.onResetFilters}
        isLoading={list.query.isPending}
        isFetching={list.query.isFetching || list.search !== list.input.q}
        error={list.query.error?.message}
        onRetry={() => void list.query.refetch()}
        onGiftPlus={handleGiftPlus}
        onBanUser={async () => {}}
        onUnbanUser={async () => {}}
        onForceSignOutUser={async () => {}}
        onDeleteUser={async () => {}}
      />
    </>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Admin fixture root is missing");
const rootRoute = createRootRoute({
  component: () => (
    <AdminShell
      user={
        {
          id: "admin",
          name: "Muslim Admin",
          email: "admin@sydia.id",
        } as UserProfile
      }
    >
      <Outlet />
    </AdminShell>
  ),
});

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/users",
  component: AdminFixture,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([usersRoute]),
  history: createMemoryHistory({ initialEntries: ["/admin/users"] }),
});

createRoot(root).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>
);
