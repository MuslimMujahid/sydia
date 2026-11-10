import type { OnGiftPlus } from "./types";
import { useCallback, useState } from "react";
import { exportAdminUsers } from "./export-users";
import { ChevronDown, Clock3, Download, Search, X } from "lucide-react";
import { EmptyState } from "@/components/app-states";
import { DomainInlineError } from "@/components/domain/domain-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  UserActionDialog,
  type PendingUserAction,
} from "@/components/admin/user-actions";
import { UsersPagination } from "@/components/admin/users-pagination";
import { UsersTable } from "@/components/admin/users-table";
import type {
  AdminOverview,
  AdminUser,
  AdminUserAction,
  AdminUserStatus,
  AdminUsersInput,
} from "@/components/admin/types";
import { cn } from "@/lib/utils/cn";

export type AdminPageProps = {
  overview: AdminOverview;
  users: AdminUser[];
  pagination: { offset: number; limit: number; total: number };
  query: string;
  statusFilter: StatusFilter;
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

type StatusFilter = AdminUserStatus | "all";

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Semua" },
  { value: "active", label: "Diizinkan" },
  { value: "banned", label: "Diblokir" },
];

const DEFAULT_ERROR_MESSAGE = "Aksi gagal dijalankan. Coba lagi.";

function AdminSkeleton() {
  return (
    <div
      className="space-y-8"
      aria-busy="true"
      aria-label="Memuat data pengguna"
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <span
            key={index}
            className="h-16 animate-pulse rounded-sm bg-surface-1 motion-reduce:animate-none"
          />
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((index) => (
          <span
            key={index}
            className="block h-12 animate-pulse rounded-sm bg-surface-1 motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}

export function AdminPage({
  overview,
  users,
  pagination,
  query,
  statusFilter,
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
  const [expandedUserIds, setExpandedUserIds] = useState<string[]>([]);
  const [now] = useState(Date.now);
  const [confirm, setConfirm] = useState<{
    user: AdminUser;
    action: AdminUserAction;
  } | null>(null);

  const [pending, setPending] = useState<PendingUserAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleToggleDetail = useCallback((userId: string) => {
    setExpandedUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    );
  }, []);

  const handleAction = useCallback(
    (user: AdminUser, action: AdminUserAction) => {
      setActionError(null);
      setConfirm({ user, action });
    },
    []
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
      await exportAdminUsers({
        offset: 0,
        limit: 100,
        ...filters,
        q: query,
        status: statusFilter,
      });
    } catch (error) {
      console.error("Admin CSV export failed", error);
      setExportError(
        error instanceof Error ? error.message : "Ekspor gagal. Coba lagi."
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em]">
            Pengguna
          </h1>
          <p className="text-[15px] leading-[1.5] text-ink-muted">
            Pantau status dan aktivitas pengguna, lalu kelola akses akun dengan
            aman.
          </p>
        </div>
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
      </header>
      {isLoading ? (
        <AdminSkeleton />
      ) : error ? (
        <DomainInlineError
          title="Gagal memuat data pengguna"
          message={error}
          onRetry={onRetry ?? (() => undefined)}
        />
      ) : (
        <>
          <section aria-label="Daftar pengguna" className="space-y-7">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <div
                role="group"
                aria-label="Filter status pengguna"
                className="mr-auto flex items-center gap-6"
              >
                {STATUS_FILTERS.map((filter) => {
                  const active = statusFilter === filter.value;
                  const count =
                    filter.value === "all"
                      ? overview.totalUsers
                      : filter.value === "active"
                        ? overview.allowedUsers
                        : overview.bannedUsers;

                  return (
                    <button
                      key={filter.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onStatusChange(filter.value)}
                      className={cn(
                        "-mb-px border-b-2 px-0 pb-2 font-sans text-[15px] font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50",
                        active
                          ? "border-brand text-ink"
                          : "border-transparent text-ink-muted hover:text-ink"
                      )}
                    >
                      {filter.label}{" "}
                      <span className="font-mono text-[13px] font-medium">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
              {onFiltersChange && (
                <>
                  <Popover>
                    <PopoverTrigger
                      render={
                        <Button
                          variant="dark-outline"
                          size="sm"
                          className="h-[42px] rounded-[8px] bg-canvas px-3 text-sm font-normal"
                        />
                      }
                    >
                      Paket:{" "}
                      {filters.plan === "plus"
                        ? "Sydia Plus"
                        : filters.plan === "trial"
                          ? "Trial"
                          : filters.plan === "expired"
                            ? "Kedaluwarsa"
                            : "Semua"}
                      <ChevronDown
                        aria-hidden="true"
                        className="text-ink-muted"
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-64 space-y-4">
                      <PopoverTitle>Filter pengguna</PopoverTitle>
                      <label className="block text-sm text-ink-muted">
                        Paket
                        <select
                          aria-label="Filter paket"
                          className="mt-1 block h-10 w-full rounded-[8px] border border-ink/16 bg-canvas px-3 text-sm text-ink focus-visible:outline-brand"
                          value={filters.plan ?? ""}
                          onChange={(event) =>
                            onFiltersChange({
                              plan: (event.target.value ||
                                undefined) as AdminUsersInput["plan"],
                            })
                          }
                        >
                          <option value="">Semua paket</option>
                          <option value="trial">Trial</option>
                          <option value="plus">Sydia Plus</option>
                          <option value="expired">Kedaluwarsa</option>
                        </select>
                      </label>
                      <label className="block text-sm text-ink-muted">
                        Aktivitas
                        <select
                          aria-label="Filter aktivitas"
                          className="mt-1 block h-10 w-full rounded-[8px] border border-ink/16 bg-canvas px-3 text-sm text-ink focus-visible:outline-brand"
                          value={filters.activity ?? ""}
                          onChange={(event) =>
                            onFiltersChange({
                              activity: (event.target.value ||
                                undefined) as AdminUsersInput["activity"],
                            })
                          }
                        >
                          <option value="">Semua aktivitas</option>
                          <option value="active">Aktif · 30 hari</option>
                          <option value="inactive">
                            Tidak aktif · 30 hari
                          </option>
                        </select>
                      </label>
                    </PopoverContent>
                  </Popover>
                  <label className="relative flex h-[42px] items-center rounded-[8px] border border-ink/16 bg-canvas pl-3 text-sm">
                    Urutkan:
                    <select
                      aria-label="Urutkan pengguna"
                      className="h-full w-[128px] min-w-0 appearance-none rounded-[8px] bg-transparent pr-9 pl-1 text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      value={filters.sort ?? "newest"}
                      onChange={(event) =>
                        onFiltersChange({
                          sort: event.target.value as AdminUsersInput["sort"],
                        })
                      }
                    >
                      <option value="newest">Terbaru</option>
                      <option value="oldest">Terlama</option>
                      <option value="activity">Aktivitas terakhir</option>
                      <option value="cost">Biaya 30 hari</option>
                    </select>
                    <ChevronDown
                      aria-hidden="true"
                      className="pointer-events-none absolute right-3 size-4 text-ink-muted"
                    />
                  </label>
                </>
              )}
              <div className="relative w-full min-[1400px]:w-72">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
                />
                <Input
                  type="search"
                  aria-label="Cari pengguna"
                  placeholder="Cari nama atau email"
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  className="h-[42px] rounded-[8px] border-ink/16 bg-canvas pl-9"
                />
              </div>
            </div>
            {(filters.attention || filters.activity) && (
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
                <span>Filter aktif:</span>
                {filters.attention && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1.5 text-brand focus-visible:outline-brand"
                    onClick={() => onFiltersChange?.({ attention: undefined })}
                    aria-label="Hapus filter perhatian"
                  >
                    <Clock3 className="size-3.5" aria-hidden="true" />
                    {filters.attention === "trial-expiring"
                      ? "Trial berakhir ≤ 7 hari"
                      : "Sydia Plus berakhir ≤ 7 hari"}
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                )}
                {filters.activity && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1.5 text-brand focus-visible:outline-brand"
                    onClick={() => onFiltersChange?.({ activity: undefined })}
                  >
                    {filters.activity === "active"
                      ? "Aktif · 30 hari"
                      : "Tidak aktif · 30 hari"}
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-8 px-1 text-[13px]"
                  onClick={onResetFilters}
                >
                  Hapus semua
                </Button>
                {filters.attention && (
                  <span className="ml-auto font-mono text-xs">
                    Dibuka dari Beranda · Perlu perhatian
                  </span>
                )}
              </div>
            )}
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
                onGiftPlus={onGiftPlus}
                expandedUserIds={expandedUserIds}
                now={now}
                actionsDisabled={pending !== null || isFetching}
                onToggleDetail={handleToggleDetail}
                onAction={handleAction}
              />
            )}
            <nav
              aria-label="Paginasi pengguna"
              aria-busy={isFetching}
              className="flex flex-wrap items-center justify-between gap-3 pt-0"
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
          </section>
        </>
      )}
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
