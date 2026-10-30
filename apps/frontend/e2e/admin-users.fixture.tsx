import { useCallback } from "react";
import type { OnGiftPlus } from "../src/components/admin/types";
import { createRoot } from "react-dom/client";
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

function AdminFixture() {
  const list = useAdminUsersList();
  const { mutateAsync: giftPlus } = useAdminGiftPlus();
  const handleGiftPlus = useCallback<OnGiftPlus>(
    (user, input) => giftPlus({ userId: user.id, input }),
    [giftPlus]
  );

  return (
    <main className="p-4 sm:p-8">
      <AdminPage
        overview={{
          totalUsers: 51,
          activeUsers: 50,
          bannedUsers: 1,
          activeSessions: 0,
          storageBytes: 0,
          llmCostUsd: 0,
          llmCostBreakdown: [],
        }}
        users={list.query.data?.data ?? []}
        pagination={
          list.query.data?.pagination ?? { offset: 0, limit: 25, total: 0 }
        }
        query={list.search}
        statusFilter={list.input.status}
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
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Admin fixture root is missing");
createRoot(root).render(
  <QueryClientProvider client={client}>
    <AdminFixture />
  </QueryClientProvider>
);
