import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

const cardVariants = cva(
  "rounded-lg border border-ink/6 bg-canvas p-6 shadow-card",
  {
    variants: {
      variant: {
        light: "text-ink",
        dark: "text-ink",
        "dark-accent": "text-ink",
      },
    },
    defaultVariants: { variant: "light" },
  }
);

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
        "font-display text-xl leading-[1.22] font-semibold tracking-[-0.018em]",
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
      className={cn(
        "font-sans text-[15px] leading-6 text-ink-muted",
        className
      )}
      {...props}
    />
  );
}

export { Card, CardTitle, CardDescription, cardVariants };
export type { CardProps };
