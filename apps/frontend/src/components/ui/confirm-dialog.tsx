import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./dialog";

type ConfirmOptions = {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
};

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirms a destructive action; prefer `useConfirm` over `window.confirm`. */
function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Batal",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent>
        <DialogTitle className="pr-6">{title}</DialogTitle>
        {description ? (
          <DialogDescription className="mt-3">{description}</DialogDescription>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ConfirmRequest = {
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
};

/**
 * Promise-based replacement for `window.confirm`. Render `confirmDialog`
 * inside the component (within an open dialog's content when nested) and
 * `await confirm({...})` where the native confirm used to be.
 */
function useConfirm() {
  const [open, setOpen] = useState(false);
  // Kept after closing so the dialog does not go blank during its exit animation.
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const pending = useRef<ConfirmRequest | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    pending.current?.resolve(confirmed);
    pending.current = null;
    setOpen(false);
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    // A newer request supersedes one that was never answered.
    pending.current?.resolve(false);

    return new Promise<boolean>((resolve) => {
      pending.current = { options: next, resolve };
      setOptions(next);
      setOpen(true);
    });
  }, []);

  useEffect(
    () => () => {
      pending.current?.resolve(false);
      pending.current = null;
    },
    []
  );

  const confirmDialog = options ? (
    <ConfirmDialog
      {...options}
      open={open}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null;

  return { confirm, confirmDialog };
}

export { ConfirmDialog, useConfirm };
export type { ConfirmDialogProps, ConfirmOptions };
