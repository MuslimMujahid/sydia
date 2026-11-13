import { memo, type MouseEvent } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Sparkline } from "./analytics/charts";
import { ACTIVITY_FEATURES } from "./analytics/meta";
import { formatCount, formatUsd } from "./format";
import { GiftPlusPopover } from "./gift-plus-popover";
import type {
  AdminPeriod,
  AdminUser,
  AdminUserAction,
  OnGiftPlus,
} from "./types";
import { UserActionsMenu } from "./user-actions";
import { PlanBadge, UserAvatar } from "./users/user-badges";
import {
  GROUP_LABELS,
  costFlag,
  engagementGroup,
  formatRecent,
  formatSignedIdr,
  marginIdr,
  pageTypicalCostPerAction,
  periodDays,
  periodPhrase,
  type CostFlag,
} from "./users/user-metrics";
import { cn } from "@/lib/utils/cn";

type RowContext = {
  now: number;
  period: AdminPeriod;
  typical: number | null;
  actionsDisabled: boolean;
  onGiftPlus: OnGiftPlus;
  onAction: (user: AdminUser, action: AdminUserAction) => void;
  onSelectUser: (userId: string) => void;
};

type UserRowProps = RowContext & { user: AdminUser; selected: boolean };

function UserIdentity({
  user,
  onSelectUser,
}: Pick<UserRowProps, "user" | "onSelectUser">) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <UserAvatar name={user.name} banned={user.status === "banned"} />
      <button
        type="button"
        aria-label={`Buka detail ${user.name}`}
        onClick={() => onSelectUser(user.id)}
        className="min-w-0 rounded-sm text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50"
      >
        <span className="block truncate text-sm leading-5 font-semibold text-ink hover:underline">
          {user.name}
        </span>
        <span className="block truncate text-xs leading-[18px] text-ink-muted">
          {user.email}
        </span>
      </button>
    </div>
  );
}

function groupLabel(user: AdminUser, period: AdminPeriod): string {
  return GROUP_LABELS[
    engagementGroup({
      actions: user.periodActions,
      activeDays: user.periodActiveDays,
      features: user.periodFeatures,
      days: periodDays(period),
      lastActivityAt: user.lastActivityAt,
    })
  ];
}

function Activity({ user }: { user: AdminUser }) {
  return (
    <span className="inline-flex items-end gap-2.5">
      <Sparkline values={user.periodActivity} className="h-5 w-[84px]" />
      <span
        className={cn(
          "font-mono text-xs whitespace-nowrap",
          user.periodActions === 0 ? "text-ink-muted" : "text-ink"
        )}
      >
        {formatCount(user.periodActions)} aksi
      </span>
    </span>
  );
}

function Cost({ user, flag }: { user: AdminUser; flag: CostFlag }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[13px] font-semibold whitespace-nowrap",
        flag === "leak"
          ? "text-red-600"
          : flag === "idle"
            ? "text-amber-700"
            : "text-ink"
      )}
    >
      {formatUsd(user.periodCostUsd)}
      {flag && (
        <>
          <AlertTriangle aria-hidden="true" className="size-3.5" />
          <span className="sr-only">
            {flag === "leak" ? "Biaya tidak wajar" : "Biaya tanpa aksi"}
          </span>
        </>
      )}
    </span>
  );
}

function Margin({ user, period }: { user: AdminUser; period: AdminPeriod }) {
  const value = Math.round(
    marginIdr(user.plan, user.periodCostUsd, periodDays(period))
  );

  return (
    <span
      className={cn(
        "font-mono text-xs whitespace-nowrap",
        value > 0
          ? "text-emerald-700"
          : value < 0
            ? "text-red-600"
            : "text-ink-muted"
      )}
    >
      {formatSignedIdr(value)}
    </span>
  );
}

function LastActive({ user, now }: { user: AdminUser; now: number }) {
  return user.lastActivityAt ? (
    <time dateTime={user.lastActivityAt}>
      {formatRecent(user.lastActivityAt, now)}
    </time>
  ) : (
    <span aria-label="Belum pernah aktif">—</span>
  );
}

function RowActions({
  user,
  actionsDisabled,
  onGiftPlus,
  onAction,
}: UserRowProps) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <GiftPlusPopover
        user={user}
        disabled={actionsDisabled}
        onGiftPlus={onGiftPlus}
      />
      <UserActionsMenu
        user={user}
        disabled={actionsDisabled}
        onAction={onAction}
      />
    </div>
  );
}

/**
 * Opens the drawer for clicks anywhere on a row except its own controls and
 * anything portalled out of it (popovers and menus bubble through React).
 */
function openFromRow(
  event: MouseEvent<HTMLElement>,
  userId: string,
  onSelectUser: (userId: string) => void
) {
  const target = event.target;
  if (!(target instanceof Element) || !event.currentTarget.contains(target))
    return;
  if (target.closest("button, a, input, select, label, [role='menu']")) return;
  onSelectUser(userId);
}

const UserTableRow = memo(function UserTableRow(props: UserRowProps) {
  const { user, now, period, typical, selected, onSelectUser } = props;

  return (
    <tr
      onClick={(event) => openFromRow(event, user.id, onSelectUser)}
      className={cn(
        "cursor-pointer border-b border-ink/6 last:border-0 hover:bg-ink/[0.025]",
        selected && "bg-brand/[0.04]"
      )}
    >
      <td className="py-3 pr-4 pl-5">
        <UserIdentity user={user} onSelectUser={onSelectUser} />
      </td>
      <td className="py-3 pr-4">
        <PlanBadge user={user} now={now} />
      </td>
      <td
        className={cn(
          "py-3 pr-4 text-[13px]",
          user.periodActions === 0 ? "text-ink-muted" : "text-ink"
        )}
      >
        {groupLabel(user, period)}
      </td>
      <td className="py-3 pr-4">
        <Activity user={user} />
      </td>
      <td className="py-3 pr-4 font-mono text-xs">
        {user.periodFeatures}/{ACTIVITY_FEATURES.length}
      </td>
      <td className="py-3 pr-4">
        <Cost user={user} flag={costFlag(user, typical)} />
      </td>
      <td className="py-3 pr-4">
        <Margin user={user} period={period} />
      </td>
      <td className="py-3 pr-4 text-[13px] whitespace-nowrap text-ink-muted">
        <LastActive user={user} now={now} />
      </td>
      <td className="py-3 pr-3">
        <RowActions {...props} />
      </td>
    </tr>
  );
});

const UserCard = memo(function UserCard(props: UserRowProps) {
  const { user, now, period, typical, selected, onSelectUser } = props;

  return (
    <li
      onClick={(event) => openFromRow(event, user.id, onSelectUser)}
      className={cn(
        "space-y-3 border-b border-ink/6 px-4 py-4 last:border-0 sm:px-5",
        selected && "bg-brand/[0.04]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <UserIdentity user={user} onSelectUser={onSelectUser} />
        <PlanBadge user={user} now={now} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 pl-11 text-xs sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <dt className="mb-1 text-ink-muted">
            Aktivitas {periodPhrase(period)}
          </dt>
          <dd>
            <Activity user={user} />
          </dd>
        </div>
        <div>
          <dt className="mb-1 text-ink-muted">Kelompok · Fitur</dt>
          <dd>
            {groupLabel(user, period)} ·{" "}
            <span className="font-mono">
              {user.periodFeatures}/{ACTIVITY_FEATURES.length}
            </span>
          </dd>
        </div>
        <div>
          <dt className="mb-1 text-ink-muted">Biaya · Margin</dt>
          <dd className="flex flex-wrap items-center gap-x-2">
            <Cost user={user} flag={costFlag(user, typical)} />
            <Margin user={user} period={period} />
          </dd>
        </div>
        <div>
          <dt className="mb-1 text-ink-muted">Terakhir aktif</dt>
          <dd>
            <LastActive user={user} now={now} />
          </dd>
        </div>
      </dl>
      <RowActions {...props} />
    </li>
  );
});

type UsersTableProps = Omit<RowContext, "typical"> & {
  users: AdminUser[];
  selectedUserId: string | null;
  sortedByCost: boolean;
  onSortByCost?: () => void;
};

const HEADER_CELL =
  "py-3 pr-4 text-xs font-medium whitespace-nowrap text-ink-muted";

export function UsersTable({
  users,
  selectedUserId,
  sortedByCost,
  onSortByCost,
  ...context
}: UsersTableProps) {
  const typical = pageTypicalCostPerAction(users);
  const phrase = periodPhrase(context.period);

  return (
    <>
      <div className="relative hidden overflow-x-auto xl:block">
        <table className="w-full min-w-[1120px] border-collapse text-left">
          <caption className="sr-only">
            Daftar pengguna Sydia beserta paket, aktivitas, biaya dan margin{" "}
            {phrase}
          </caption>
          <colgroup>
            <col />
            <col className="w-[160px]" />
            <col className="w-[96px]" />
            <col className="w-[170px]" />
            <col className="w-[60px]" />
            <col className="w-[120px]" />
            <col className="w-[104px]" />
            <col className="w-[120px]" />
            <col className="w-[164px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-ink/6">
              <th scope="col" className={cn(HEADER_CELL, "pl-5")}>
                Pengguna
              </th>
              <th scope="col" className={HEADER_CELL}>
                Paket
              </th>
              <th scope="col" className={HEADER_CELL}>
                Kelompok
              </th>
              <th scope="col" className={HEADER_CELL}>
                Aktivitas {phrase}
              </th>
              <th scope="col" className={HEADER_CELL}>
                Fitur
              </th>
              <th
                scope="col"
                aria-sort={sortedByCost ? "descending" : undefined}
                className={HEADER_CELL}
              >
                {onSortByCost ? (
                  <button
                    type="button"
                    onClick={onSortByCost}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-sm outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-brand/50",
                      sortedByCost && "text-ink"
                    )}
                  >
                    Biaya {phrase}
                    <ChevronDown
                      aria-hidden="true"
                      className={cn("size-3.5", !sortedByCost && "opacity-40")}
                    />
                  </button>
                ) : (
                  `Biaya ${phrase}`
                )}
              </th>
              <th scope="col" className={HEADER_CELL}>
                Margin
              </th>
              <th scope="col" className={HEADER_CELL}>
                Terakhir aktif
              </th>
              <th scope="col">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <UserTableRow
                key={user.id}
                user={user}
                selected={user.id === selectedUserId}
                typical={typical}
                {...context}
              />
            ))}
          </tbody>
        </table>
      </div>
      <ul className="xl:hidden">
        {users.map((user) => (
          <UserCard
            key={user.id}
            user={user}
            selected={user.id === selectedUserId}
            typical={typical}
            {...context}
          />
        ))}
      </ul>
    </>
  );
}
