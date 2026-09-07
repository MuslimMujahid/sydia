import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatBytes,
  formatCount,
  formatDate,
  formatLastActivity,
  formatUsd,
} from "@/components/admin/format";
import { UserActionsMenu } from "@/components/admin/user-actions";
import type {
  AdminUsage,
  AdminUser,
  AdminUserAction,
  AdminUserStatus,
} from "@/components/admin/types";
import { cn } from "@/lib/utils/cn";

const STATUS_LABELS: Record<AdminUserStatus, string> = {
  active: "Aktif",
  banned: "Diblokir",
};

const USAGE_LABELS: Record<keyof AdminUsage, string> = {
  conversations: "Percakapan",
  documents: "Dokumen",
  memories: "Memori",
  reminders: "Pengingat",
  tasks: "Tugas",
  contacts: "Kontak",
  events: "Acara",
};

function detailPanelId(userId: string): string {
  return `user-detail-${userId}`;
}

function StatusBadge({ status }: { status: AdminUserStatus }) {
  return (
    <Badge dot={status === "active" ? "brand" : "destructive"}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function DetailToggle({
  user,
  expanded,
  onToggle,
  className,
}: {
  user: AdminUser;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-expanded={expanded}
      aria-controls={detailPanelId(user.id)}
      aria-label={`Detail penggunaan untuk ${user.name}`}
      onClick={onToggle}
      className={className}
    >
      Detail
      <ChevronDown
        className={cn("transition-transform", expanded && "rotate-180")}
      />
    </Button>
  );
}

function UserDetailPanel({ user }: { user: AdminUser }) {
  const usageKeys = Object.keys(USAGE_LABELS) as Array<keyof AdminUsage>;

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-[1fr_auto] lg:gap-12">
      <div>
        <h3 className="font-mono text-[11px] font-medium tracking-widest text-ink-muted uppercase">
          Penggunaan
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          {usageKeys.map((key) => (
            <div key={key}>
              <dt className="text-[13px] leading-[1.4] text-ink-muted">
                {USAGE_LABELS[key]}
              </dt>
              <dd className="mt-0.5 font-mono text-[13px] font-medium text-ink">
                {formatCount(user.usage[key])}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <h3 className="font-mono text-[11px] font-medium tracking-widest text-ink-muted uppercase">
          Sesi & biaya
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <div>
            <dt className="text-[13px] leading-[1.4] text-ink-muted">
              Sesi aktif
            </dt>
            <dd className="mt-0.5 font-mono text-[13px] font-medium text-ink">
              {formatCount(user.activeSessions)}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] leading-[1.4] text-ink-muted">
              Penyimpanan
            </dt>
            <dd className="mt-0.5 font-mono text-[13px] font-medium text-ink">
              {formatBytes(user.storageBytes)}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] leading-[1.4] text-ink-muted">
              Biaya LLM
            </dt>
            <dd className="mt-0.5 font-mono text-[13px] font-medium text-ink">
              {formatUsd(user.llmCostUsd)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export function UsersTable({
  users,
  expandedUserId,
  actionsDisabled,
  onToggleDetail,
  onAction,
}: {
  users: AdminUser[];
  expandedUserId: string | null;
  actionsDisabled: boolean;
  onToggleDetail: (userId: string) => void;
  onAction: (user: AdminUser, action: AdminUserAction) => void;
}) {
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">
            Daftar pengguna Sydia beserta status dan aktivitasnya
          </caption>
          <thead>
            <tr className="border-b border-ink/8">
              <th
                scope="col"
                className="py-3 pr-4 text-[13px] font-medium text-ink-muted"
              >
                Pengguna
              </th>
              <th
                scope="col"
                className="w-28 px-4 py-3 text-[13px] font-medium text-ink-muted"
              >
                Status
              </th>
              <th
                scope="col"
                className="w-32 px-4 py-3 text-[13px] font-medium text-ink-muted"
              >
                Daftar
              </th>
              <th
                scope="col"
                className="w-44 px-4 py-3 text-[13px] font-medium text-ink-muted"
              >
                Aktivitas terakhir
              </th>
              <th scope="col" className="w-44 py-3 pl-4 text-right">
                <span className="sr-only">Detail dan aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const expanded = expandedUserId === user.id;

              return [
                <tr key={user.id} className="border-b border-ink/6">
                  <td className="max-w-0 py-3.5 pr-4">
                    <p className="truncate text-[15px] font-medium text-ink">
                      {user.name}
                    </p>
                    <p className="truncate text-sm text-ink-muted">
                      {user.email}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="px-4 py-3.5 font-mono text-[13px] text-ink-muted">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-[13px] text-ink-muted">
                    {formatLastActivity(user.lastActivityAt)}
                  </td>
                  <td className="py-3.5 pl-4">
                    <div className="flex items-center justify-end gap-1">
                      <DetailToggle
                        user={user}
                        expanded={expanded}
                        onToggle={() => onToggleDetail(user.id)}
                      />
                      <UserActionsMenu
                        user={user}
                        disabled={actionsDisabled}
                        onAction={onAction}
                      />
                    </div>
                  </td>
                </tr>,
                expanded ? (
                  <tr
                    key={`${user.id}-detail`}
                    className="border-b border-ink/6"
                  >
                    <td
                      colSpan={5}
                      id={detailPanelId(user.id)}
                      className="bg-surface-1/40 px-4 py-5"
                    >
                      <UserDetailPanel user={user} />
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {users.map((user) => {
          const expanded = expandedUserId === user.id;

          return (
            <li
              key={user.id}
              className="rounded-lg border border-ink/6 bg-canvas p-4 shadow-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-ink">
                    {user.name}
                  </p>
                  <p className="truncate text-sm text-ink-muted">
                    {user.email}
                  </p>
                </div>
                <StatusBadge status={user.status} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[13px] leading-[1.4] text-ink-muted">
                    Daftar
                  </dt>
                  <dd className="mt-0.5 font-mono text-[13px] text-ink">
                    {formatDate(user.createdAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[13px] leading-[1.4] text-ink-muted">
                    Aktivitas terakhir
                  </dt>
                  <dd className="mt-0.5 font-mono text-[13px] text-ink">
                    {formatLastActivity(user.lastActivityAt)}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex items-center justify-between border-t border-ink/6 pt-2">
                <DetailToggle
                  user={user}
                  expanded={expanded}
                  onToggle={() => onToggleDetail(user.id)}
                />
                <UserActionsMenu
                  user={user}
                  disabled={actionsDisabled}
                  onAction={onAction}
                />
              </div>
              {expanded ? (
                <div
                  id={detailPanelId(user.id)}
                  className="mt-3 border-t border-ink/6 pt-4"
                >
                  <UserDetailPanel user={user} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
