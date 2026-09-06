import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type CheckboxProps = CheckboxPrimitive.Root.Props;

function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-sm border border-ink/16 bg-canvas outline-none hover:border-brand/50 data-[checked]:border-brand data-[checked]:bg-brand data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[focused]:outline-2 data-[focused]:outline-offset-2 data-[focused]:outline-brand/50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="text-ink">
        <Check className="size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
export type { CheckboxProps };
