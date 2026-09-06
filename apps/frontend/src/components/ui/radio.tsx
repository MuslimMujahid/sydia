import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

type RadioGroupProps = ComponentProps<typeof RadioGroupPrimitive>;

function RadioGroup({ className, ...props }: RadioGroupProps) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("space-y-3", className)}
      {...props}
    />
  );
}

type RadioProps = RadioPrimitive.Root.Props;

function Radio({ className, ...props }: RadioProps) {
  return (
    <RadioPrimitive.Root
      data-slot="radio"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-pill border border-ink/16 bg-canvas outline-none hover:border-brand/50 data-[checked]:border-brand data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[focused]:outline-2 data-[focused]:outline-offset-2 data-[focused]:outline-brand/50",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator className="size-2 rounded-pill bg-brand" />
    </RadioPrimitive.Root>
  );
}

export { RadioGroup, Radio };
export type { RadioGroupProps, RadioProps };
