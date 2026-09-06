import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent bg-clip-padding font-sans text-[15px] leading-[1.4] font-semibold whitespace-nowrap outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50 active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:saturate-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "aurora-gradient border-0 font-bold text-canvas shadow-button hover:brightness-[0.97]",
        secondary:
          "bg-brand text-canvas shadow-button hover:brightness-[0.97] focus-visible:outline-brand/50",
        dark: "bg-ink text-background hover:brightness-[0.97]",
        "dark-outline": "border-ink/16 bg-transparent text-ink hover:text-ink",
        ghost:
          "border-0 bg-transparent px-[18px] text-ink-muted hover:text-ink",
        destructive:
          "bg-destructive text-canvas hover:brightness-[0.97] focus-visible:outline-destructive/50",
        link: "border-0 bg-transparent px-[18px] text-ink-muted hover:text-ink hover:underline",
      },
      size: {
        default: "min-h-11 px-[22px] py-3",
        sm: "min-h-10 px-[18px] py-2.5 text-sm",
        lg: "min-h-11 px-[22px] py-3",
        icon: "size-11 p-0",
        "icon-sm": "size-10 p-0",
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
