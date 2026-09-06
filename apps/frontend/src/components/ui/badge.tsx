import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

type BadgeDot = "brand" | "warn" | "destructive" | "ink-weak";

const dotClasses: Record<BadgeDot, string> = {
  brand: "bg-brand-deep",
  warn: "bg-warn",
  destructive: "bg-destructive",
  "ink-weak": "bg-ink-weak",
};

type BadgeProps = ComponentProps<"span"> & { dot?: BadgeDot };

function Badge({ className, dot, children, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border border-ink/8 bg-canvas px-3 py-1 font-sans text-[13px] leading-[1.4] text-ink-muted",
        className
      )}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={cn("size-2 rounded-pill", dotClasses[dot])}
        />
      ) : null}
      {children}
    </span>
  );
}

export { Badge };
export type { BadgeProps, BadgeDot };
