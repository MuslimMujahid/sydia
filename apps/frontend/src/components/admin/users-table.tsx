import { memo, useId } from "react";
import { ChevronDown } from "lucide-react";
import { GiftPlusPopover } from "./gift-plus-popover";
import { remainingDays, UserDetailPanel } from "./user-detail-panel";
import { formatDate } from "./format";
import { UserActionsMenu } from "./user-actions";
import type {
  AdminUser,
  AdminUserAction,
  AdminUserStatus,
  OnGiftPlus,
} from "./types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

function StatusBadge({ status }: { status: AdminUserStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-ink/6 bg-canvas px-2 py-0.5 text-xs leading-4 text-ink-muted">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          status === "active" ? "bg-brand" : "bg-destructive"
        )}
      />
      {status === "active" ? "Diizinkan" : "Diblokir"}
    </span>
  );
}

function PlanBadge({ user, now }: { user: AdminUser; now: number }) {
  const trialDays =
    user.trialEndsAt !== null ? remainingDays(user.trialEndsAt, now) : null;

  const plusDays =
    user.paidUntil !== null ? remainingDays(user.paidUntil, now) : null;

  const urgent =
    (user.plan === "trial" && trialDays !== null && trialDays <= 3) ||
    (user.plan === "plus" && plusDays !== null && plusDays <= 3);

  const expiry =
    user.paidUntil !== null
      ? new Intl.DateTimeFormat("id-ID", {
          day: "numeric",
          month: "short",
        }).format(new Date(user.paidUntil))
      : null;

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-ink/6 bg-canvas px-2 py-0.5 text-xs leading-4 text-ink-muted">
      {(user.plan !== "trial" || urgent) && (
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            urgent
              ? "bg-orange-700"
              : user.plan === "plus"
                ? "bg-brand"
                : "bg-ink-muted"
          )}
        />
      )}
      {user.plan === "plus"
        ? `Plus${expiry ? ` · s.d. ${expiry}` : ""}`
        : user.plan === "trial"
          ? `Trial${trialDays !== null ? ` · ${trialDays} hari lagi` : ""}`
          : user.plan === "expired"
            ? "Trial berakhir"
            : "Belum diberlakukan"}
    </span>
  );
}

function UserIdentity({ user }: { user: AdminUser }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium",
          user.status === "banned"
            ? "bg-destructive/10 text-destructive"
            : "bg-brand/10 text-brand"
        )}
      >
        {user.name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0])
          .join("")
          .toLocaleUpperCase("id-ID")}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium leading-5 text-ink">
          {user.name}
        </p>
        <p className="truncate text-[13px] leading-[18px] text-ink-muted">
          {user.email}
        </p>
      </div>
    </div>
  );
}

function LastActivity({ value }: { value: string | null }) {
  return value ? (
    <time dateTime={value}>
      {new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))}
    </time>
  ) : (
    <>Belum pernah aktif</>
  );
}

type UserRowProps = {
  user: AdminUser;
  now: number;
  expanded: boolean;
  actionsDisabled: boolean;
  onGiftPlus: OnGiftPlus;
  onToggleDetail: (userId: string) => void;
  onAction: (user: AdminUser, action: AdminUserAction) => void;
};

function RowActions({
  user,
  expanded,
  actionsDisabled,
  onToggleDetail,
  onGiftPlus,
  onAction,
  panelId,
}: UserRowProps & { panelId: string }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={`Detail penggunaan untuk ${user.name}`}
        onClick={() => onToggleDetail(user.id)}
        className={cn(
          "min-h-8 rounded-[8px] px-2.5 py-1.5 text-[13px] text-ink hover:bg-ink/5",
          expanded && "bg-ink/5"
        )}
      >
        Detail{" "}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-3.5 transition-transform motion-reduce:transition-none",
            expanded && "rotate-180"
          )}
        />
      </Button>
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

const UserTableRow = memo(function UserTableRow(props: UserRowProps) {
  const { user, now, expanded } = props;
  const panelId = useId();

  return (
    <>
      <tr
        className={cn(
          "h-[65px] border-b border-ink/6",
          expanded && "bg-ink/[0.025]"
        )}
      >
        <td className="py-3 pr-4">
          <UserIdentity user={user} />
        </td>
        <td className="py-3 pr-4">
          <PlanBadge user={user} now={now} />
        </td>
        <td className="py-3 pr-4">
          <StatusBadge status={user.status} />
        </td>
        <td className="py-3 pr-4 font-mono text-[13px] text-ink-muted">
          <time dateTime={user.createdAt}>{formatDate(user.createdAt)}</time>
        </td>
        <td className="py-3 pr-4 font-mono text-[13px] text-ink-muted">
          <LastActivity value={user.lastActivityAt} />
        </td>
        <td className="py-3">
          <RowActions {...props} panelId={panelId} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-ink/6 bg-ink/[0.025]">
          <td colSpan={6} id={panelId} className="pt-4 pr-4 pb-5 pl-[60px]">
            <UserDetailPanel user={user} now={now} />
          </td>
        </tr>
      )}
    </>
  );
});

const UserCard = memo(function UserCard(props: UserRowProps) {
  const { user, now, expanded } = props;
  const panelId = useId();

  return (
    <li
      className={cn("border-b border-ink/6 py-4", expanded && "bg-ink/[0.025]")}
    >
      <div className="flex items-center justify-between gap-3">
        <UserIdentity user={user} />
        <StatusBadge status={user.status} />
      </div>
      <div className="mt-3 pl-11">
        <PlanBadge user={user} now={now} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 pl-11 text-xs text-ink-muted">
        <div>
          <dt className="mb-1">Daftar</dt>
          <dd className="font-mono">{formatDate(user.createdAt)}</dd>
        </div>
        <div>
          <dt className="mb-1">Aktivitas terakhir</dt>
          <dd className="font-mono">
            <LastActivity value={user.lastActivityAt} />
          </dd>
        </div>
      </dl>
      <div className="mt-3">
        <RowActions {...props} panelId={panelId} />
      </div>
      {expanded && (
        <div id={panelId} className="mt-4">
          <UserDetailPanel user={user} now={now} />
        </div>
      )}
    </li>
  );
});

type UsersTableProps = Omit<UserRowProps, "user" | "expanded"> & {
  users: AdminUser[];
  expandedUserIds: string[];
};

export function UsersTable({
  users,
  expandedUserIds,
  ...props
}: UsersTableProps) {
  return (
    <div className="border-t border-ink/6 pt-7">
      <div className="hidden xl:block">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">
            Daftar pengguna Sydia beserta status dan aktivitasnya
          </caption>
          <colgroup>
            <col />
            <col className="w-[15%]" />
            <col className="w-[11.4%]" />
            <col className="w-[12.3%]" />
            <col className="w-[16.9%]" />
            <col className="w-60" />
          </colgroup>
          <thead>
            <tr className="border-b border-ink/6">
              {[
                "Pengguna",
                "Paket",
                "Akses",
                "Daftar",
                "Aktivitas terakhir",
              ].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="pb-3 pr-4 pt-2 text-[13px] font-medium text-ink-muted"
                >
                  {label}
                </th>
              ))}
              <th scope="col">
                <span className="sr-only">Detail dan aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <UserTableRow
                key={user.id}
                user={user}
                expanded={expandedUserIds.includes(user.id)}
                {...props}
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
            expanded={expandedUserIds.includes(user.id)}
            {...props}
          />
        ))}
      </ul>
    </div>
  );
}
