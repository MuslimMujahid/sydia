import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const DialogRoot = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

type DialogContentProps = DialogPrimitive.Popup.Props & { showClose?: boolean };

function DialogContent({
  className,
  showClose = true,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-ink/60 transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-canvas p-6 text-ink transition-all data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
          className
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            aria-label="Tutup"
            className="absolute top-4 right-4 rounded-sm p-1 text-ink-weak transition-colors outline-none hover:text-ink focus-visible:ring-3 focus-visible:ring-brand/40"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

type DialogTitleProps = DialogPrimitive.Title.Props;

function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-display text-2xl leading-[26.4px] font-bold text-ink",
        className
      )}
      {...props}
    />
  );
}

type DialogDescriptionProps = DialogPrimitive.Description.Props;

function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("font-sans text-base leading-6 text-ink-muted", className)}
      {...props}
    />
  );
}

export {
  DialogRoot as Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
};
export type { DialogContentProps, DialogTitleProps, DialogDescriptionProps };
