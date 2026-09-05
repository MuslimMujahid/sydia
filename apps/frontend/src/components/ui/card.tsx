import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

const cardVariants = cva("rounded-xl p-6", {
  variants: {
    variant: {
      light: "border border-surface-1 bg-canvas text-ink",
      dark: "bg-editorial text-canvas",
      "dark-accent": "border border-brand bg-editorial text-canvas",
    },
  },
  defaultVariants: { variant: "light" },
});

type CardProps = ComponentProps<"div"> & VariantProps<typeof cardVariants>;

function Card({ className, variant = "light", ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ variant, className }))}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn(
        "font-display text-2xl leading-[26.4px] font-bold",
        className
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("font-sans text-base leading-6 text-ink-muted", className)}
      {...props}
    />
  );
}

export { Card, CardTitle, CardDescription, cardVariants };
export type { CardProps };
