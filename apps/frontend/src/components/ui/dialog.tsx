import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const DialogRoot = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

const dialogContentVariants = cva(
  "fixed z-50 w-full border-ink/6 bg-canvas text-ink shadow-card transition-all data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
  {
    variants: {
      variant: {
        center:
          "top-1/2 left-1/2 max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border p-6 data-[ending-style]:scale-95 data-[starting-style]:scale-95",
        // A bottom sheet on phones that becomes a centered dialog from `sm`.
        sheet:
          "inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-lg border-t px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[ending-style]:translate-y-4 data-[starting-style]:translate-y-4 sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border sm:p-6 sm:data-[ending-style]:-translate-y-1/2 sm:data-[ending-style]:scale-95 sm:data-[starting-style]:-translate-y-1/2 sm:data-[starting-style]:scale-95",
      },
    },
    defaultVariants: { variant: "center" },
  }
);

type DialogContentProps = DialogPrimitive.Popup.Props &
  VariantProps<typeof dialogContentVariants> & { showClose?: boolean };

function DialogContent({
  className,
  variant = "center",
  showClose = true,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-ink/60 transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(dialogContentVariants({ variant }), className)}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            aria-label="Tutup"
            className="absolute top-4 right-4 rounded-sm p-1 text-ink-muted outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-brand/50"
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
        "font-display text-xl leading-[1.22] font-semibold tracking-[-0.018em] text-ink",
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
      className={cn(
        "font-sans text-[15px] leading-6 text-ink-muted",
        className
      )}
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
