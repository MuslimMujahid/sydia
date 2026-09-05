import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-pill border border-transparent bg-clip-padding font-display font-semibold whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-brand/40 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-brand text-ink hover:bg-brand-hover",
        secondary: "border-ink bg-transparent text-ink hover:bg-ink/5",
        dark: "bg-editorial text-canvas hover:bg-editorial-deep",
        "dark-outline":
          "border-canvas/50 bg-transparent text-canvas hover:border-canvas hover:bg-canvas/5",
        ghost: "text-ink-soft hover:bg-surface-1 hover:text-ink",
        destructive:
          "bg-destructive text-canvas hover:bg-destructive/90 focus-visible:ring-destructive/30",
        link: "text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-[17px] text-lg",
        sm: "h-8 px-3 text-sm",
        lg: "h-12 px-6 text-lg",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
);

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>;

function Button({
  className,
  variant = "primary",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
