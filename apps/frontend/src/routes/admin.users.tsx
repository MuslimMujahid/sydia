import { useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminPage } from "@/components/admin/admin-page";
import { DomainInlineError } from "@/components/domain/domain-page";
import {
  DEFAULT_PERIOD,
  periodSearch,
} from "@/components/admin/analytics/meta";
import type {
  AdminPeriod,
  AdminUser,
  AdminUserAction,
  AdminUsersInput,
  OnGiftPlus,
} from "@/components/admin/types";
import {
  adminOverviewQueryOptions,
  useAdminUsersList,
  useAdminUserAction,
  useAdminGiftPlus,
} from "@/lib/services/api/admin/admin.queries";

export const Route = createFileRoute("/admin/users")({
  validateSearch: (
    search: Record<string, unknown>
  ): {
    attention?: AdminUsersInput["attention"];
    q?: string;
    period?: AdminPeriod;
    user?: string;
  } => ({
    ...periodSearch(search),
    user:
      typeof search.user === "string" && search.user ? search.user : undefined,
    attention:
      search.attention === "trial-expiring" ||
      search.attention === "plus-expiring"
        ? search.attention
        : undefined,
    q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
  }),
  head: () => ({ meta: [{ title: "Pengguna · Sydia Admin" }] }),
  component: UsersRoute,
});

function UsersRoute() {
  const { attention, q, period = DEFAULT_PERIOD, user } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <UsersContent
      key={`${attention ?? "all"}:${q ?? ""}:${period}`}
      attention={attention}
      q={q}
      period={period}
      onPeriodChange={(next) =>
        void navigate({ search: (prev) => ({ ...prev, period: next }) })
      }
      selectedUserId={user ?? null}
      onSelectUser={(userId) =>
        void navigate({
          search: (prev) => ({ ...prev, user: userId ?? undefined }),
        })
      }
    />
  );
}

function UsersContent({
  attention,
  q,
  period,
  onPeriodChange,
  selectedUserId,
  onSelectUser,
}: {
  attention: AdminUsersInput["attention"];
  q?: string;
  period: AdminPeriod;
  onPeriodChange: (period: AdminPeriod) => void;
  selectedUserId: string | null;
  onSelectUser: (userId: string | null) => void;
}) {
  const overview = useQuery(adminOverviewQueryOptions());
  const list = useAdminUsersList({ attention, period, ...(q ? { q } : {}) });
  const action = useAdminUserAction();
  const { mutateAsync: giftPlus } = useAdminGiftPlus();
  const onGiftPlus = useCallback<OnGiftPlus>(
    (user, input) => giftPlus({ userId: user.id, input }),
    [giftPlus]
  );

  async function act(user: AdminUser, kind: AdminUserAction) {
    await action.mutateAsync({ userId: user.id, action: kind });
  }

  if (overview.isPending || (!list.query.data && list.query.isPending))
    return (
      <p aria-busy="true" role="status">
        Memuat pengguna…
      </p>
    );
  if (!overview.data || !list.query.data)
    return (
      <DomainInlineError
        title="Gagal memuat pengguna"
        message={
          overview.error?.message ??
          list.query.error?.message ??
          "Data pengguna tidak tersedia"
        }
        onRetry={() => {
          void overview.refetch();
          void list.query.refetch();
        }}
      />
    );

  return (
    <AdminPage
      period={period}
      onPeriodChange={onPeriodChange}
      selectedUserId={selectedUserId}
      onSelectUser={onSelectUser}
      overview={overview.data}
      users={list.query.data.data}
      pagination={list.query.data.pagination}
      query={list.search}
      statusFilter={list.input.status}
      filters={list.input}
      onFiltersChange={list.onFiltersChange}
      onQueryChange={list.onSearchChange}
      onStatusChange={list.onStatusChange}
      onOffsetChange={list.onOffsetChange}
      onResetFilters={list.onResetFilters}
      isFetching={list.query.isFetching || list.search !== list.input.q}
      error={overview.error?.message ?? list.query.error?.message ?? null}
      onRetry={() => {
        void overview.refetch();
        void list.query.refetch();
      }}
      onGiftPlus={onGiftPlus}
      onBanUser={(user) => act(user, "ban")}
      onUnbanUser={(user) => act(user, "unban")}
      onForceSignOutUser={(user) => act(user, "force-sign-out")}
      onDeleteUser={(user) => act(user, "delete")}
    />
  );
}
