import { ChevronDown, Clock3, Search, X } from "lucide-react";
import type {
  AdminOverview,
  AdminPeriod,
  AdminUserStatus,
  AdminUsersInput,
} from "../types";
import { periodPhrase } from "./user-metrics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils/cn";

export type StatusFilter = AdminUserStatus | "all";

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Semua" },
  { value: "active", label: "Diizinkan" },
  { value: "banned", label: "Diblokir" },
];

const PLAN_LABELS: Record<NonNullable<AdminUsersInput["plan"]>, string> = {
  plus: "Sydia Plus",
  trial: "Trial",
  expired: "Kedaluwarsa",
};

const SELECT =
  "mt-1 block h-10 w-full rounded-[8px] border border-ink/16 bg-canvas px-3 text-sm text-ink focus-visible:outline-brand";

type UsersToolbarProps = {
  overview: AdminOverview;
  period: AdminPeriod;
  statusFilter: StatusFilter;
  query: string;
  filters: Partial<AdminUsersInput>;
  onStatusChange: (status: StatusFilter) => void;
  onQueryChange: (query: string) => void;
  onFiltersChange?: (filters: Partial<AdminUsersInput>) => void;
  onResetFilters: () => void;
};

export function UsersToolbar({
  overview,
  period,
  statusFilter,
  query,
  filters,
  onStatusChange,
  onQueryChange,
  onFiltersChange,
  onResetFilters,
}: UsersToolbarProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
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
                    className="h-10 min-h-10 rounded-[8px] bg-canvas px-3 text-sm font-normal"
                  />
                }
              >
                Paket: {filters.plan ? PLAN_LABELS[filters.plan] : "Semua"}
                <ChevronDown aria-hidden="true" className="text-ink-muted" />
              </PopoverTrigger>
              <PopoverContent className="w-64 space-y-4">
                <PopoverTitle>Filter pengguna</PopoverTitle>
                <label className="block text-sm text-ink-muted">
                  Paket
                  <select
                    aria-label="Filter paket"
                    className={SELECT}
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
                    className={SELECT}
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
                    <option value="inactive">Tidak aktif · 30 hari</option>
                  </select>
                </label>
              </PopoverContent>
            </Popover>
            <label className="relative flex h-10 items-center rounded-[8px] border border-ink/16 bg-canvas pl-3 text-sm">
              Urutkan:
              <select
                aria-label="Urutkan pengguna"
                className="h-full w-[148px] min-w-0 appearance-none rounded-[8px] bg-transparent pr-9 pl-1 text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand"
                value={filters.sort ?? "cost"}
                onChange={(event) =>
                  onFiltersChange({
                    sort: event.target.value as AdminUsersInput["sort"],
                  })
                }
              >
                <option value="cost">Biaya {periodPhrase(period)}</option>
                <option value="activity">Aktivitas terakhir</option>
                <option value="newest">Terbaru</option>
                <option value="oldest">Terlama</option>
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-3 size-4 text-ink-muted"
              />
            </label>
          </>
        )}
        <div className="relative w-full sm:w-64">
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
            className="h-10 rounded-[8px] border-ink/16 bg-canvas pl-9"
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
    </div>
  );
}
