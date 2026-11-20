import { useRef, useState, type FormEvent } from "react";
import {
  Ban,
  ChevronDown,
  Gift,
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
import {
  GiftPlusDuration,
  validGiftDuration,
  type GiftDurationSelection,
} from "../gift-plus-duration";
import type { AdminBulkAction, AdminBulkFailure, AdminUser } from "../types";

type BulkAction = AdminBulkAction["action"];

const ACTIONS = {
  "gift-plus": {
    label: "Hadiah Sydia Plus",
    icon: Gift,
    description: null,
  },
  ban: {
    label: "Blokir pengguna",
    icon: Ban,
    description:
      "Pengguna tidak dapat masuk dan semua sesi aktif akan ditutup.",
  },
  unban: {
    label: "Buka blokir",
    icon: UserCheck,
    description: "Pengguna dapat masuk kembali setelah blokir dibuka.",
  },
  "force-sign-out": {
    label: "Paksa keluar",
    icon: LogOut,
    description: "Semua sesi aktif di semua perangkat akan ditutup.",
  },
  delete: {
    label: "Hapus pengguna",
    icon: Trash2,
    description: "Akun beserta seluruh datanya akan dihapus permanen.",
  },
};

function eligibleUsers(users: AdminUser[], action: BulkAction) {
  if (action === "ban") return users.filter((user) => user.status === "active");
  if (action === "unban")
    return users.filter((user) => user.status === "banned");

  return users;
}

type BulkUserActionsProps = {
  users: AdminUser[];
  disabled: boolean;
  onRun: (request: AdminBulkAction) => Promise<AdminBulkFailure[]>;
};

type BulkConfirmation = { action: BulkAction; users: AdminUser[] };

function confirmationKey({ action, users }: BulkConfirmation) {
  return JSON.stringify([action, ...users.map(({ id }) => id).sort()]);
}

export function BulkUserActions({
  users,
  disabled,
  onRun,
}: BulkUserActionsProps) {
  const [confirmation, setConfirmation] = useState<BulkConfirmation | null>(
    null
  );

  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <>
      {users.length > 0 && (
        <>
          <span aria-live="polite" className="text-sm tabular-nums text-ink">
            {users.length} dipilih
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  ref={trigger}
                  variant="dark-outline"
                  size="sm"
                  disabled={disabled}
                />
              }
            >
              Aksi massal
              <ChevronDown aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(ACTIONS) as BulkAction[]).map((action) => {
                const { icon: Icon, label } = ACTIONS[action];
                const recipients = eligibleUsers(users, action);

                return (
                  <DropdownMenuItem
                    key={action}
                    disabled={recipients.length === 0}
                    destructive={action === "delete"}
                    onClick={() => {
                      setConfirmation({ action, users: recipients });
                      setOpen(true);
                    }}
                  >
                    <Icon aria-hidden="true" />
                    {label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      {confirmation && (
        <BulkActionDialog
          key={confirmationKey(confirmation)}
          {...confirmation}
          open={open}
          onRun={onRun}
          onClose={(keepRequest) => {
            setOpen(false);
            if (!keepRequest) setConfirmation(null);
          }}
          finalFocus={trigger}
        />
      )}
    </>
  );
}

type BulkActionDialogProps = BulkConfirmation &
  Pick<BulkUserActionsProps, "onRun"> & {
    open: boolean;
    onClose: (keepRequest: boolean) => void;
    finalFocus: React.RefObject<HTMLButtonElement | null>;
  };

function BulkActionDialog({
  action,
  users,
  open,
  onRun,
  onClose,
  finalFocus,
}: BulkActionDialogProps) {
  const [duration, setDuration] = useState<GiftDurationSelection>(30);
  const [customDays, setCustomDays] = useState("");
  const [request, setRequest] = useState<AdminBulkAction | null>(null);
  const [failures, setFailures] = useState<AdminBulkFailure[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const days = duration === "custom" ? Number(customDays) : duration;
  const isGift = action === "gift-plus";
  const isDelete = action === "delete";
  const canRetry = isGift && (Boolean(failures?.length) || error !== null);
  const finished = failures !== null || error !== null;
  const copy = ACTIONS[action];
  const close = () => onClose(canRetry && request !== null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      submitting.current ||
      (finished && !canRetry) ||
      (isGift && !validGiftDuration(days))
    )
      return;
    submitting.current = true;
    setPending(true);
    setError(null);

    try {
      const userIds = users.map((user) => user.id);
      const initialRequest =
        request ??
        (action === "gift-plus"
          ? {
              action,
              userIds,
              input: { durationDays: days, requestId: crypto.randomUUID() },
            }
          : { action, userIds });

      setRequest(initialRequest);
      setFailures(
        await onRun({
          ...initialRequest,
          userIds: failures
            ? failures.map(({ userId }) => userId)
            : initialRequest.userIds,
        })
      );
    } catch (caught) {
      console.error("Admin bulk action could not be confirmed", caught);
      setError("Hasil aksi massal belum dapat dikonfirmasi.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      <DialogContent
        variant="sheet"
        showClose={false}
        finalFocus={finalFocus}
        className="max-h-[85dvh] overflow-y-auto sm:max-w-md"
      >
        <DialogTitle>{copy.label}</DialogTitle>
        <DialogDescription className="mt-2">
          {users.length} pengguna. {copy.description}
        </DialogDescription>
        <form
          onSubmit={(event) => void submit(event)}
          className="mt-5 space-y-4"
          aria-busy={pending}
        >
          {isDelete && !finished && (
            <ul
              aria-label="Akun yang akan dihapus"
              className="max-h-36 space-y-1 overflow-y-auto rounded-md bg-ink/5 p-3 text-sm text-ink-muted"
            >
              {users.map(({ id, email }) => (
                <li key={id}>{email}</li>
              ))}
            </ul>
          )}
          {isGift && !finished && (
            <GiftPlusDuration
              selection={duration}
              customDays={customDays}
              disabled={pending || request !== null}
              onSelectionChange={setDuration}
              onCustomDaysChange={setCustomDays}
            />
          )}
          {failures && (
            <p role="status" className="text-sm font-medium">
              {users.length - failures.length} berhasil
              {failures.length > 0 &&
                ` · ${failures.length} belum terkonfirmasi`}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {Boolean(failures?.length) && (
            <ul
              aria-label="Pengguna dengan aksi yang belum terkonfirmasi"
              className="max-h-36 space-y-2 overflow-y-auto rounded-md bg-ink/5 p-3 text-sm text-ink-muted"
            >
              {failures?.map(({ userId, message }) => (
                <li key={userId}>
                  <span className="font-medium text-ink">
                    {users.find((user) => user.id === userId)?.email}
                  </span>
                  <p>{message}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant={finished && !canRetry ? "dark" : "ghost"}
              disabled={pending}
              onClick={close}
            >
              {finished ? "Tutup" : "Batal"}
            </Button>
            {(!finished || canRetry || pending) && (
              <Button
                type="submit"
                variant={isDelete ? "destructive" : "dark"}
                disabled={pending || (isGift && !validGiftDuration(days))}
              >
                {pending
                  ? "Memproses…"
                  : canRetry
                    ? "Coba lagi"
                    : isGift
                      ? "Kirim hadiah"
                      : isDelete
                        ? "Hapus permanen"
                        : copy.label}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
