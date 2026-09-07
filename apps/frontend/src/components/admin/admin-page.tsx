import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { EmptyState } from "@/components/app-states";
import { DomainInlineError } from "@/components/domain/domain-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OverviewStats } from "@/components/admin/overview-stats";
import {
  UserActionDialog,
  type PendingUserAction,
} from "@/components/admin/user-actions";
import { UsersTable } from "@/components/admin/users-table";
import type {
  AdminOverview,
  AdminUser,
  AdminUserAction,
  AdminUserStatus,
} from "@/components/admin/types";
import { cn } from "@/lib/utils/cn";

export type AdminPageProps = {
  overview: AdminOverview;
  users: AdminUser[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onBanUser: (user: AdminUser) => Promise<void>;
  onUnbanUser: (user: AdminUser) => Promise<void>;
  onForceSignOutUser: (user: AdminUser) => Promise<void>;
  onDeleteUser: (user: AdminUser) => Promise<void>;
};

type StatusFilter = AdminUserStatus | "all";

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Semua" },
  { value: "active", label: "Aktif" },
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
  isLoading = false,
  error = null,
  onRetry,
  onBanUser,
  onUnbanUser,
  onForceSignOutUser,
  onDeleteUser,
}: AdminPageProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    user: AdminUser;
    action: AdminUserAction;
  } | null>(null);

  const [pending, setPending] = useState<PendingUserAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return users.filter((user) => {
      if (statusFilter !== "all" && user.status !== statusFilter) return false;
      if (!keyword) return true;

      return (
        user.name.toLowerCase().includes(keyword) ||
        user.email.toLowerCase().includes(keyword)
      );
    });
  }, [query, statusFilter, users]);

  const isFiltering = query.trim() !== "" || statusFilter !== "all";

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
      setActionError(
        caught instanceof Error && caught.message
          ? caught.message
          : DEFAULT_ERROR_MESSAGE
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <p className="font-mono text-[13px] font-medium tracking-widest text-ink-muted uppercase">
          Admin / Operasi
        </p>
        <h1 className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em]">
          Pengguna
        </h1>
        <p className="max-w-2xl text-[15px] leading-[1.6] text-ink-muted">
          Pantau status dan aktivitas pengguna, lalu kelola akses akun dengan
          aman.
        </p>
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
          <OverviewStats overview={overview} />
          <section aria-label="Daftar pengguna" className="space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div
                role="group"
                aria-label="Filter status pengguna"
                className="flex items-center gap-6 border-b border-ink/8"
              >
                {STATUS_FILTERS.map((filter) => {
                  const active = statusFilter === filter.value;
                  const count =
                    filter.value === "all"
                      ? users.length
                      : users.filter((user) => user.status === filter.value)
                          .length;

                  return (
                    <button
                      key={filter.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setStatusFilter(filter.value)}
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
              <div className="relative sm:w-72">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
                />
                <Input
                  type="search"
                  aria-label="Cari pengguna"
                  placeholder="Cari nama atau email"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            {isFiltering ? (
              <p className="text-sm text-ink-muted" role="status">
                Menampilkan {filteredUsers.length} dari {users.length} pengguna.
              </p>
            ) : null}
            {users.length === 0 ? (
              <EmptyState
                title="Belum ada pengguna"
                message="Pengguna yang mendaftar akan muncul di sini beserta status dan aktivitasnya."
              />
            ) : filteredUsers.length === 0 ? (
              <EmptyState
                title="Tidak ada pengguna yang cocok"
                message="Coba kata kunci lain atau atur ulang filter status."
                action={
                  <Button
                    variant="dark-outline"
                    size="sm"
                    onClick={() => {
                      setQuery("");
                      setStatusFilter("all");
                    }}
                  >
                    Atur ulang filter
                  </Button>
                }
              />
            ) : (
              <UsersTable
                users={filteredUsers}
                expandedUserId={expandedUserId}
                actionsDisabled={pending !== null}
                onToggleDetail={(userId) =>
                  setExpandedUserId((current) =>
                    current === userId ? null : userId
                  )
                }
                onAction={(user, action) => {
                  setActionError(null);
                  setConfirm({ user, action });
                }}
              />
            )}
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
