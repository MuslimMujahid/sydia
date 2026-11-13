import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchX } from "lucide-react";
import { ErrorBanner, Skeleton } from "../analytics/widgets";
import { formatDate } from "../format";
import { GiftPlusPopover } from "../gift-plus-popover";
import type {
  AdminPeriod,
  AdminUser,
  AdminUserAction,
  AdminUserInsights,
  OnGiftPlus,
} from "../types";
import { UserActionsMenu } from "../user-actions";
import { GroupBadge, PlanBadge, StatusBadge, UserAvatar } from "./user-badges";
import { UserInsightsBody, insightsGroup } from "./user-insights";
import { GROUP_LABELS, channelLabel } from "./user-metrics";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ApiClientError } from "@/lib/services/api/api";
import { adminUserInsightsQueryOptions } from "@/lib/services/api/admin/admin.queries";
import { cn } from "@/lib/utils/cn";

const DRAWER_PERIODS: ReadonlyArray<{ value: AdminPeriod; label: string }> = [
  { value: "7d", label: "7 hari" },
  { value: "30d", label: "30 hari" },
  { value: "90d", label: "90 hari" },
];

/** The drawer compares whole days; hourly page periods open on 7 days. */
function drawerPeriod(period: AdminPeriod): AdminPeriod {
  return DRAWER_PERIODS.some((entry) => entry.value === period) ? period : "7d";
}

export type UserDrawerProps = {
  userId: string | null;
  /** The list row, when the user is on the current page. */
  user: AdminUser | undefined;
  period: AdminPeriod;
  now: number;
  actionsDisabled: boolean;
  onGiftPlus: OnGiftPlus;
  onAction: (user: AdminUser, action: AdminUserAction) => void;
  onClose: () => void;
};

export function UserDrawer({ userId, ...props }: UserDrawerProps) {
  return (
    <Dialog
      open={userId !== null}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent
        backdropClassName="bg-ink/40"
        className="top-0 right-0 left-auto h-dvh max-w-[600px] translate-x-0 translate-y-0 overflow-y-auto overscroll-contain rounded-none border-0 border-l p-0 data-[ending-style]:translate-x-6 data-[ending-style]:scale-100 data-[starting-style]:translate-x-6 data-[starting-style]:scale-100"
      >
        {userId !== null && (
          <UserDrawerContent key={userId} userId={userId} {...props} />
        )}
      </DialogContent>
    </Dialog>
  );
}

type ContentProps = Omit<UserDrawerProps, "userId" | "onClose"> & {
  userId: string;
};

function UserDrawerContent({
  userId,
  user,
  period: pagePeriod,
  now,
  actionsDisabled,
  onGiftPlus,
  onAction,
}: ContentProps) {
  const [period, setPeriod] = useState(() => drawerPeriod(pagePeriod));
  const insights = useQuery(adminUserInsightsQueryOptions(period, userId));
  const notFound =
    insights.error instanceof ApiClientError && insights.error.status === 404;

  return (
    <div className="pb-8">
      <DrawerHeader
        user={user}
        insights={insights.data}
        now={now}
        actionsDisabled={actionsDisabled}
        onGiftPlus={onGiftPlus}
        onAction={onAction}
      />
      <div className="space-y-6 px-5 pt-5 sm:px-6">
        <div
          role="group"
          aria-label="Periode detail"
          className="inline-flex rounded-full border border-ink/8 p-1"
        >
          {DRAWER_PERIODS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === period}
              onClick={() => setPeriod(value)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-brand",
                value === period
                  ? "bg-ink font-semibold text-canvas"
                  : "text-ink-muted hover:bg-surface-1 hover:text-ink"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {notFound ? (
          <div className="flex flex-col items-center py-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-ink/6 text-ink-muted">
              <SearchX aria-hidden="true" className="size-6" />
            </span>
            <p className="mt-4 font-semibold">Pengguna tidak ditemukan</p>
            <p className="mt-1 max-w-xs text-sm text-ink-muted">
              Akun ini mungkin sudah dihapus. Tutup panel untuk kembali ke
              daftar.
            </p>
          </div>
        ) : insights.data ? (
          <UserInsightsBody
            insights={insights.data}
            user={user}
            now={now}
            isFetching={insights.isFetching}
          />
        ) : insights.error ? (
          <ErrorBanner
            title="Rincian pengguna gagal dimuat"
            message={insights.error.message}
            onRetry={() => void insights.refetch()}
            isRetrying={insights.isFetching}
          />
        ) : (
          <InsightsSkeleton />
        )}
      </div>
    </div>
  );
}

type DrawerHeaderProps = Pick<
  ContentProps,
  "user" | "now" | "actionsDisabled" | "onGiftPlus" | "onAction"
> & { insights: AdminUserInsights | undefined };

function DrawerHeader({
  user,
  insights,
  now,
  actionsDisabled,
  onGiftPlus,
  onAction,
}: DrawerHeaderProps) {
  if (!user)
    return (
      <header
        aria-busy="true"
        className="space-y-4 border-b border-ink/6 px-5 pt-6 pr-14 pb-5 sm:px-6"
      >
        <DialogTitle className="sr-only">Detail pengguna</DialogTitle>
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        </div>
        <p className="text-xs text-ink-muted">
          Pengguna ini tidak ada di halaman daftar saat ini, jadi data akun
          tidak ditampilkan.
        </p>
      </header>
    );

  const group = insights ? insightsGroup(insights, user.lastActivityAt) : null;
  const channels = user.channels.map(channelLabel).join(", ");

  return (
    <header className="space-y-4 border-b border-ink/6 px-5 pt-6 pb-5 sm:px-6">
      <div className="flex items-center gap-3 pr-10">
        <UserAvatar
          name={user.name}
          banned={user.status === "banned"}
          size="lg"
        />
        <div className="min-w-0">
          <DialogTitle className="truncate text-xl">{user.name}</DialogTitle>
          <p className="text-[13px] text-ink-muted [overflow-wrap:anywhere]">
            {user.email} · daftar {formatDate(user.createdAt)}
            {channels && ` · ${channels}`}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <PlanBadge user={user} now={now} />
          {group && <GroupBadge label={GROUP_LABELS[group]} />}
          <StatusBadge status={user.status} />
        </div>
        <div className="flex items-center gap-2">
          <GiftPlusPopover
            user={user}
            disabled={actionsDisabled}
            onGiftPlus={onGiftPlus}
          />
          <UserActionsMenu
            user={user}
            disabled={actionsDisabled}
            onAction={onAction}
            trigger="button"
          />
        </div>
      </div>
    </header>
  );
}

function InsightsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Memuat rincian pengguna"
      className="space-y-6"
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {[0, 1].map((chart) => (
          <div key={chart} className="flex h-36 items-end gap-2">
            {[40, 70, 30, 85, 55, 75, 50].map((height, index) => (
              <Skeleton key={index} className="flex-1" height={height} />
            ))}
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
