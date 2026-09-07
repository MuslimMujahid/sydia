import {
  AlertTriangle,
  Ban,
  EllipsisVertical,
  LogOut,
  Trash2,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCount } from "@/components/admin/format";
import type { AdminUser, AdminUserAction } from "@/components/admin/types";

const ACTION_COPY: Record<
  AdminUserAction,
  {
    menuLabel: string;
    title: (user: AdminUser) => string;
    body: (user: AdminUser) => string;
    confirmLabel: string;
    pendingLabel: string;
    destructive?: boolean;
  }
> = {
  ban: {
    menuLabel: "Blokir pengguna",
    title: (user) => `Blokir ${user.name}?`,
    body: (user) =>
      `${user.name} (${user.email}) tidak akan bisa masuk, dan ${
        user.activeSessions > 0
          ? `${formatCount(user.activeSessions)} sesi aktifnya`
          : "sesi aktifnya"
      } ditutup. Anda dapat membuka blokir kapan saja.`,
    confirmLabel: "Blokir pengguna",
    pendingLabel: "Memblokir…",
  },
  unban: {
    menuLabel: "Buka blokir",
    title: (user) => `Buka blokir ${user.name}?`,
    body: (user) =>
      `Akses ${user.name} (${user.email}) dipulihkan dan pengguna dapat masuk kembali.`,
    confirmLabel: "Buka blokir",
    pendingLabel: "Membuka blokir…",
  },
  "force-sign-out": {
    menuLabel: "Paksa keluar",
    title: (user) => `Paksa ${user.name} keluar?`,
    body: (user) =>
      `Semua sesi aktif ${user.name} (${formatCount(
        user.activeSessions
      )} sesi) ditutup di semua perangkat dan pengguna harus masuk kembali. Data akun tidak berubah.`,
    confirmLabel: "Paksa keluar",
    pendingLabel: "Mengeluarkan…",
  },
  delete: {
    menuLabel: "Hapus pengguna",
    title: (user) => `Hapus ${user.name} secara permanen?`,
    body: (user) =>
      `Akun ${user.email} beserta seluruh datanya — ${formatCount(
        user.usage.conversations
      )} percakapan, ${formatCount(user.usage.documents)} dokumen, dan ${formatCount(
        user.usage.memories
      )} memori — dihapus permanen. Tindakan ini tidak dapat dibatalkan.`,
    confirmLabel: "Hapus permanen",
    pendingLabel: "Menghapus…",
    destructive: true,
  },
};

export type PendingUserAction = {
  userId: string;
  action: AdminUserAction;
};

export function UserActionsMenu({
  user,
  disabled,
  onAction,
}: {
  user: AdminUser;
  disabled: boolean;
  onAction: (user: AdminUser, action: AdminUserAction) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Aksi untuk ${user.name}`}
            disabled={disabled}
          />
        }
      >
        <EllipsisVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {user.status === "active" ? (
          <DropdownMenuItem onClick={() => onAction(user, "ban")}>
            <Ban />
            {ACTION_COPY.ban.menuLabel}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => onAction(user, "unban")}>
            <UserCheck />
            {ACTION_COPY.unban.menuLabel}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          disabled={user.activeSessions === 0}
          onClick={() => onAction(user, "force-sign-out")}
        >
          <LogOut />
          {ACTION_COPY["force-sign-out"].menuLabel}
        </DropdownMenuItem>
        <DropdownMenuItem destructive onClick={() => onAction(user, "delete")}>
          <Trash2 />
          {ACTION_COPY.delete.menuLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserActionDialog({
  confirm,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  confirm: { user: AdminUser; action: AdminUserAction } | null;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={confirm !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent>
        {confirm ? (
          <>
            <DialogTitle>
              {ACTION_COPY[confirm.action].title(confirm.user)}
            </DialogTitle>
            <DialogDescription className="mt-2">
              {ACTION_COPY[confirm.action].body(confirm.user)}
            </DialogDescription>
            {error ? (
              <p
                role="alert"
                className="mt-4 flex items-start gap-2 text-sm text-destructive"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="ghost" disabled={pending} onClick={onClose}>
                Batal
              </Button>
              <Button
                variant={
                  ACTION_COPY[confirm.action].destructive
                    ? "destructive"
                    : "secondary"
                }
                disabled={pending}
                onClick={onConfirm}
              >
                {pending
                  ? ACTION_COPY[confirm.action].pendingLabel
                  : ACTION_COPY[confirm.action].confirmLabel}
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
