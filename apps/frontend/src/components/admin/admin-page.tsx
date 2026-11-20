import { useCallback, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { PeriodBar, Skeleton } from "./analytics/widgets";
import { exportAdminUsers } from "./export-users";
import type {
  AdminOverview,
  AdminBulkAction,
  AdminBulkFailure,
  AdminPeriod,
  AdminUser,
  AdminUserAction,
  AdminUsersInput,
  OnGiftPlus,
} from "./types";
import { UserActionDialog, type PendingUserAction } from "./user-actions";
import { UserDrawer } from "./users/user-drawer";
import { BulkUserActions } from "./users/bulk-user-actions";
import { periodPhrase } from "./users/user-metrics";
import { UsersToolbar, type StatusFilter } from "./users/users-toolbar";
import { UsersPagination } from "./users-pagination";
import { UsersTable } from "./users-table";
import { EmptyState } from "@/components/app-states";
import { adminPricingQueryOptions } from "@/lib/services/api/admin/admin.queries";
import { DomainInlineError } from "@/components/domain/domain-page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils/cn";

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
  onBulkAction: (request: AdminBulkAction) => Promise<AdminBulkFailure[]>;
};

const DEFAULT_ERROR_MESSAGE = "Aksi gagal dijalankan. Coba lagi.";

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

/** Mirrors the users table (desktop) and user cards (mobile) while loading. */
function UsersListSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-ink/6 bg-canvas shadow-card"
      aria-busy="true"
      aria-label="Memuat data pengguna"
      role="status"
    >
      <div className="hidden xl:block">
        <div className="flex items-center gap-6 border-b border-ink/6 px-5 py-4">
          {["w-20", "w-12", "w-16", "w-24", "w-12", "w-16", "w-14"].map(
            (width, index) => (
              <Skeleton key={index} className={cn("h-2.5", width)} />
            )
          )}
        </div>
        {SKELETON_ROWS.map((row) => (
          <div
            key={row}
            className="grid grid-cols-[minmax(220px,2fr)_96px_120px_120px_80px_120px_104px_96px] items-center gap-4 border-b border-ink/6 px-5 py-3.5 last:border-b-0"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3 w-3/5" />
                <Skeleton className="h-2.5 w-4/5" />
              </div>
            </div>
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-[84px]" />
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="ml-auto h-7 w-16 rounded-full" />
          </div>
        ))}
      </div>
      <ul className="divide-y divide-ink/6 xl:hidden">
        {SKELETON_ROWS.slice(0, 5).map((row) => (
          <li key={row} className="space-y-4 p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3 w-2/5" />
                <Skeleton className="h-2.5 w-3/5" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 pl-11 sm:grid-cols-4">
              {[0, 1, 2, 3].map((cell) => (
                <div key={cell} className="space-y-1.5">
                  <Skeleton className="h-2.5 w-14" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-ink/6 px-5 py-4">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-8 w-28 rounded-full" />
      </div>
      <span className="sr-only">Memuat pengguna…</span>
    </div>
  );
}

function UsersToolbarSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-wrap items-center gap-x-4 gap-y-3"
    >
      <div className="mr-auto flex items-center gap-6 pb-2">
        {["w-16", "w-14", "w-20"].map((width, index) => (
          <Skeleton key={index} className={cn("h-4", width)} />
        ))}
      </div>
      <Skeleton className="h-10 w-28 rounded-[8px]" />
      <Skeleton className="h-10 w-40 rounded-[8px]" />
      <Skeleton className="h-10 w-full rounded-[8px] sm:w-64" />
    </div>
  );
}

function UsersHeader({ children }: { children: ReactNode }) {
  return (
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
      <div className="flex flex-col items-end gap-1">{children}</div>
    </header>
  );
}

function ExportButton({
  disabled,
  exporting = false,
  onClick,
}: {
  disabled: boolean;
  exporting?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      variant="dark-outline"
      size="sm"
      className="rounded-[12px] bg-canvas px-4"
      disabled={disabled}
      onClick={onClick}
    >
      <Download aria-hidden="true" />
      {exporting ? "Mengekspor…" : "Ekspor CSV"}
    </Button>
  );
}

function usersComparison(period: AdminPeriod): string {
  return `Aktivitas, biaya dan margin dihitung untuk ${periodPhrase(period)} terakhir`;
}

const MARGIN_NOTE = "Margin = nilai paket pada periode − biaya model";

export type AdminUsersLoadingProps = {
  period: AdminPeriod;
  onPeriodChange: (period: AdminPeriod) => void;
};

/** First-load screen for the users page: real chrome, skeleton data. */
export function AdminUsersLoading({
  period,
  onPeriodChange,
}: AdminUsersLoadingProps) {
  return (
    <div className="space-y-6">
      <UsersHeader>
        <ExportButton disabled />
      </UsersHeader>
      <PeriodBar
        period={period}
        onPeriodChange={onPeriodChange}
        onRefresh={() => undefined}
        isFetching
        comparison={usersComparison(period)}
        status={MARGIN_NOTE}
      />
      <section aria-label="Daftar pengguna" className="space-y-5">
        <UsersToolbarSkeleton />
        <UsersListSkeleton />
      </section>
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
  onBulkAction,
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
  const selectionScope = JSON.stringify([
    query,
    statusFilter,
    period,
    filters.plan,
    filters.activity,
    filters.attention,
    filters.sort,
    filters.offset ?? pagination.offset,
  ]);

  const [selection, setSelection] = useState({
    scope: selectionScope,
    ids: new Set<string>(),
  });

  if (selection.scope !== selectionScope) {
    setSelection({ scope: selectionScope, ids: new Set() });
  }

  const checkedUsers = users.filter((user) => selection.ids.has(user.id));

  function toggleUser(userId: string, checked: boolean) {
    setSelection(({ scope, ids }) => {
      const next = new Set(ids);
      if (checked) next.add(userId);
      else next.delete(userId);

      return { scope, ids: next };
    });
  }

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
      <UsersHeader>
        <ExportButton
          disabled={exporting || isLoading || isFetching || !!error}
          exporting={exporting}
          onClick={() => void handleExport()}
        />
        {exportError && (
          <p role="alert" className="text-sm text-destructive">
            {exportError}
          </p>
        )}
      </UsersHeader>
      <PeriodBar
        period={period}
        onPeriodChange={onPeriodChange}
        onRefresh={() => onRetry?.()}
        isFetching={isFetching}
        comparison={usersComparison(period)}
        status={MARGIN_NOTE}
      />
      {isLoading ? (
        <UsersListSkeleton />
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
            <div
              className={cn(
                "flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink/6 px-4 py-2.5 sm:px-5",
                users.length === 0 && "hidden"
              )}
            >
              <label className="mr-auto flex min-h-9 cursor-pointer items-center gap-3 text-sm text-ink-muted">
                <Checkbox
                  aria-label="Pilih semua di halaman ini"
                  checked={checkedUsers.length === users.length}
                  indeterminate={
                    checkedUsers.length > 0 &&
                    checkedUsers.length < users.length
                  }
                  disabled={actionsDisabled}
                  onCheckedChange={() =>
                    setSelection({
                      scope: selectionScope,
                      ids: new Set(
                        checkedUsers.length === users.length
                          ? []
                          : users.map(({ id }) => id)
                      ),
                    })
                  }
                  className="relative size-5 after:absolute after:inset-x-1 after:h-px data-[indeterminate]:border-brand data-[indeterminate]:bg-brand/15 data-[indeterminate]:after:bg-ink [&[data-indeterminate]_svg]:hidden"
                />
                Pilih semua di halaman ini
              </label>
              <BulkUserActions
                users={checkedUsers}
                disabled={actionsDisabled}
                onRun={onBulkAction}
              />
            </div>
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
                checkedIds={selection.ids}
                onToggleUser={toggleUser}
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
