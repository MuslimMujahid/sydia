import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

type TextareaProps = ComponentProps<"textarea">;

function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-20 w-full rounded-sm border border-hairline bg-canvas px-3 py-2 font-sans text-base text-ink transition-colors outline-none placeholder:text-ink-muted hover:border-ink-weak focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/30 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
export type { TextareaProps };
