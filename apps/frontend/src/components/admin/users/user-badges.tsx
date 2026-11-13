import type { AdminUser, AdminUserStatus } from "../types";
import { formatDayMonth, initials, remainingDays } from "./user-metrics";
import { cn } from "@/lib/utils/cn";

type UserAvatarProps = {
  name: string;
  banned?: boolean;
  size?: "sm" | "lg";
};

export function UserAvatar({
  name,
  banned = false,
  size = "sm",
}: UserAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        size === "lg" ? "size-11 text-sm" : "size-8 text-[11px]",
        banned ? "bg-destructive/10 text-destructive" : "bg-brand/10 text-brand"
      )}
    >
      {initials(name)}
    </span>
  );
}

const PILL =
  "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs leading-5";

type PlanBadgeProps = {
  user: Pick<AdminUser, "plan" | "paidUntil" | "trialEndsAt">;
  now: number;
};

/** "Plus · s.d. 27 Des", "Trial · 2 hari lagi" or "Trial berakhir". */
export function PlanBadge({ user, now }: PlanBadgeProps) {
  const trialDays =
    user.trialEndsAt !== null ? remainingDays(user.trialEndsAt, now) : null;

  const urgent = user.plan === "trial" && trialDays !== null && trialDays <= 3;

  return (
    <span
      className={cn(
        PILL,
        user.plan === "plus"
          ? "bg-brand/10 text-brand"
          : urgent
            ? "bg-amber-50 text-amber-800"
            : "bg-ink/6 text-ink-muted"
      )}
    >
      {user.plan === "plus"
        ? `Plus${user.paidUntil ? ` · s.d. ${formatDayMonth(user.paidUntil)}` : ""}`
        : user.plan === "trial"
          ? `Trial${trialDays !== null ? ` · ${trialDays} hari lagi` : ""}`
          : user.plan === "expired"
            ? "Trial berakhir"
            : "Belum diberlakukan"}
    </span>
  );
}

export function StatusBadge({ status }: { status: AdminUserStatus }) {
  return (
    <span
      className={cn(
        PILL,
        status === "active"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700"
      )}
    >
      {status === "active" ? "Diizinkan" : "Diblokir"}
    </span>
  );
}

export function GroupBadge({ label }: { label: string }) {
  return (
    <span className={cn(PILL, "bg-ink/6 font-medium text-ink")}>{label}</span>
  );
}
