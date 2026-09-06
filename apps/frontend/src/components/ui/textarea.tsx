import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

type TextareaProps = ComponentProps<"textarea">;

function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-20 w-full rounded-sm border border-ink/16 bg-canvas px-3 py-2 font-sans text-[15px] text-ink outline-none placeholder:text-ink-muted hover:border-brand/50 focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15 disabled:pointer-events-none disabled:bg-ink/4 disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
export type { TextareaProps };
