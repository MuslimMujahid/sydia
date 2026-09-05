import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type CheckboxProps = CheckboxPrimitive.Root.Props;

function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-xs border border-hairline bg-canvas transition-colors outline-none hover:border-ink-weak data-[checked]:border-brand data-[checked]:bg-brand data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[focused]:ring-3 data-[focused]:ring-brand/40",
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
