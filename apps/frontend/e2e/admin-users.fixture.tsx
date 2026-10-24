import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminPage } from "../src/components/admin/admin-page";
import { useAdminUsersList } from "../src/lib/services/api/admin/admin.queries";
import "../src/styles/globals.css";

function AdminFixture() {
  const list = useAdminUsersList();

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
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <AdminFixture />
  </QueryClientProvider>
);
