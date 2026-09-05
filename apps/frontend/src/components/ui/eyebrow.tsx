import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

const eyebrowVariants = cva("font-mono uppercase", {
  variants: {
    variant: {
      plain: "text-base leading-6 text-link",
      muted: "text-base leading-6 text-ink-weak",
      chip: "inline-flex items-center rounded-sm bg-surface-2 px-2 py-0.5 text-xs leading-[18px] text-editorial-deep",
    },
  },
  defaultVariants: { variant: "plain" },
});

type EyebrowProps = ComponentProps<"span"> &
  VariantProps<typeof eyebrowVariants>;

function Eyebrow({ className, variant = "plain", ...props }: EyebrowProps) {
  return (
    <span
      data-slot="eyebrow"
      className={cn(eyebrowVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Eyebrow, eyebrowVariants };
export type { EyebrowProps };
