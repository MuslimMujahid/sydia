import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { PeriodBar } from "./analytics/widgets";
import { exportAdminUsers } from "./export-users";
import type {
  AdminOverview,
  AdminPeriod,
  AdminUser,
  AdminUserAction,
  AdminUsersInput,
  OnGiftPlus,
} from "./types";
import { UserActionDialog, type PendingUserAction } from "./user-actions";
import { UserDrawer } from "./users/user-drawer";
import { periodPhrase } from "./users/user-metrics";
import { UsersToolbar, type StatusFilter } from "./users/users-toolbar";
import { UsersPagination } from "./users-pagination";
import { UsersTable } from "./users-table";
import { EmptyState } from "@/components/app-states";
import { adminPricingQueryOptions } from "@/lib/services/api/admin/admin.queries";
import { DomainInlineError } from "@/components/domain/domain-page";
import { Button } from "@/components/ui/button";

export type AdminPageProps = {
  overview: AdminOverview;
  users: AdminUser[];
  pagination: { offset: number; limit: number; total: number };
  query: string;
  statusFilter: StatusFilter;
  /** Window of the activity, cost and margin columns. */
  period: AdminPeriod;
  onPeriodChange: (period: AdminPeriod) => void;
  /** User whose detail drawer is open; may be outside the current page. */
  selectedUserId: string | null;
  onSelectUser: (userId: string | null) => void;
  filters?: Partial<AdminUsersInput>;
  onFiltersChange?: (filters: Partial<AdminUsersInput>) => void;
  onQueryChange: (query: string) => void;
  onStatusChange: (status: StatusFilter) => void;
  onOffsetChange: (offset: number) => void;
  onResetFilters: () => void;
  isFetching?: boolean;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onBanUser: (user: AdminUser) => Promise<void>;
  onUnbanUser: (user: AdminUser) => Promise<void>;
  onForceSignOutUser: (user: AdminUser) => Promise<void>;
  onDeleteUser: (user: AdminUser) => Promise<void>;
  onGiftPlus: OnGiftPlus;
};

const DEFAULT_ERROR_MESSAGE = "Aksi gagal dijalankan. Coba lagi.";

function AdminSkeleton() {
  return (
    <div
      className="space-y-3 rounded-2xl border border-ink/6 bg-canvas p-5 shadow-card"
      aria-busy="true"
      aria-label="Memuat data pengguna"
    >
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <span
          key={index}
          className="block h-12 animate-pulse rounded-sm bg-surface-1 motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

export function AdminPage({
  overview,
  users,
  pagination,
  query,
  statusFilter,
  period,
  onPeriodChange,
  selectedUserId,
  onSelectUser,
  filters = {},
  onFiltersChange,
  onQueryChange,
  onStatusChange,
  onOffsetChange,
  onResetFilters,
  isFetching = false,
  isLoading = false,
  error = null,
  onRetry,
  onBanUser,
  onUnbanUser,
  onForceSignOutUser,
  onDeleteUser,
  onGiftPlus,
}: AdminPageProps) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [now] = useState(Date.now);
  const pricing = useQuery(adminPricingQueryOptions()).data ?? null;
  const [confirm, setConfirm] = useState<{
    user: AdminUser;
    action: AdminUserAction;
  } | null>(null);

  const [pending, setPending] = useState<PendingUserAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAction = useCallback(
    (user: AdminUser, action: AdminUserAction) => {
      setActionError(null);
      setConfirm({ user, action });
    },
    []
  );

  const handleSelectUser = useCallback(
    (userId: string) => onSelectUser(userId),
    [onSelectUser]
  );

  const isFiltering =
    query.trim() !== "" ||
    statusFilter !== "all" ||
    Boolean(filters.plan || filters.activity || filters.attention);

  const actionHandlers: Record<
    AdminUserAction,
    (user: AdminUser) => Promise<void>
  > = {
    ban: onBanUser,
    unban: onUnbanUser,
    "force-sign-out": onForceSignOutUser,
    delete: onDeleteUser,
  };

  async function handleConfirm() {
    if (!confirm) return;
    setPending({ userId: confirm.user.id, action: confirm.action });
    setActionError(null);

    try {
      await actionHandlers[confirm.action](confirm.user);
      // A deleted account has nothing left to show in its drawer.
      if (confirm.action === "delete" && confirm.user.id === selectedUserId)
        onSelectUser(null);
      setConfirm(null);
    } catch (caught) {
      console.error("Admin user action failed", caught);
      setActionError(
        caught instanceof Error && caught.message
          ? caught.message
          : DEFAULT_ERROR_MESSAGE
      );
    } finally {
      setPending(null);
    }
  }

  async function handleExport() {
    setExporting(true);
    setExportError(null);

    try {
      await exportAdminUsers(
        {
          offset: 0,
          limit: 100,
          ...filters,
          q: query,
          status: statusFilter,
          period,
        },
        pricing
      );
    } catch (error) {
      console.error("Admin CSV export failed", error);
      setExportError(
        error instanceof Error ? error.message : "Ekspor gagal. Coba lagi."
      );
    } finally {
      setExporting(false);
    }
  }

  const actionsDisabled = pending !== null || isFetching;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em]">
            Pengguna
          </h1>
          <p className="text-[15px] leading-[1.5] text-ink-muted">
            Pantau aktivitas, biaya dan margin tiap pengguna, lalu kelola akses
            akun dengan aman.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="dark-outline"
            size="sm"
            className="rounded-[12px] bg-canvas px-4"
            disabled={exporting || isLoading || isFetching || !!error}
            onClick={() => void handleExport()}
          >
            <Download aria-hidden="true" />
            {exporting ? "Mengekspor…" : "Ekspor CSV"}
          </Button>
          {exportError && (
            <p role="alert" className="text-sm text-destructive">
              {exportError}
            </p>
          )}
        </div>
      </header>
      <PeriodBar
        period={period}
        onPeriodChange={onPeriodChange}
        onRefresh={() => onRetry?.()}
        isFetching={isFetching}
        comparison={`Aktivitas, biaya dan margin dihitung untuk ${periodPhrase(period)} terakhir`}
        status="Margin = nilai paket pada periode − biaya model"
      />
      {isLoading ? (
        <AdminSkeleton />
      ) : error ? (
        <DomainInlineError
          title="Gagal memuat data pengguna"
          message={error}
          onRetry={onRetry ?? (() => undefined)}
        />
      ) : (
        <section aria-label="Daftar pengguna" className="space-y-5">
          <UsersToolbar
            overview={overview}
            period={period}
            statusFilter={statusFilter}
            query={query}
            filters={filters}
            onStatusChange={onStatusChange}
            onQueryChange={onQueryChange}
            onFiltersChange={onFiltersChange}
            onResetFilters={onResetFilters}
          />
          <div className="overflow-hidden rounded-2xl border border-ink/6 bg-canvas shadow-card">
            {users.length === 0 && !isFiltering ? (
              <EmptyState
                title="Belum ada pengguna"
                message="Pengguna yang mendaftar akan muncul di sini beserta status dan aktivitasnya."
              />
            ) : users.length === 0 ? (
              <EmptyState
                title="Tidak ada pengguna yang cocok"
                message="Coba kata kunci lain atau atur ulang filter status."
                action={
                  <Button
                    variant="dark-outline"
                    size="sm"
                    onClick={onResetFilters}
                  >
                    Atur ulang filter
                  </Button>
                }
              />
            ) : (
              <UsersTable
                users={users}
                now={now}
                period={period}
                pricing={pricing}
                selectedUserId={selectedUserId}
                sortedByCost={(filters.sort ?? "cost") === "cost"}
                onSortByCost={
                  onFiltersChange && (() => onFiltersChange({ sort: "cost" }))
                }
                actionsDisabled={actionsDisabled}
                onGiftPlus={onGiftPlus}
                onAction={handleAction}
                onSelectUser={handleSelectUser}
              />
            )}
            <nav
              aria-label="Paginasi pengguna"
              aria-busy={isFetching}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/6 px-5 py-4"
            >
              <p className="text-sm text-ink-muted" role="status">
                {isFetching
                  ? "Memuat pengguna…"
                  : `Menampilkan ${pagination.total === 0 ? 0 : pagination.offset + 1}–${pagination.offset + users.length} dari ${pagination.total} pengguna`}
              </p>
              <UsersPagination
                {...pagination}
                isFetching={isFetching}
                onOffsetChange={onOffsetChange}
              />
            </nav>
          </div>
        </section>
      )}
      <UserDrawer
        userId={selectedUserId}
        user={users.find((user) => user.id === selectedUserId)}
        period={period}
        pricing={pricing}
        now={now}
        actionsDisabled={actionsDisabled}
        onGiftPlus={onGiftPlus}
        onAction={handleAction}
        onClose={() => onSelectUser(null)}
      />
      <UserActionDialog
        confirm={confirm}
        pending={pending !== null}
        error={actionError}
        onConfirm={() => void handleConfirm()}
        onClose={() => {
          setConfirm(null);
          setActionError(null);
        }}
      />
    </div>
  );
}
