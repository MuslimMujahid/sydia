import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/lib/utils/cn";

type SwitchProps = SwitchPrimitive.Root.Props;

function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-6 w-10 shrink-0 items-center rounded-pill bg-hairline p-0.5 transition-colors outline-none data-[checked]:bg-brand data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[focused]:ring-3 data-[focused]:ring-brand/40",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="size-5 rounded-full bg-canvas transition-transform data-[checked]:translate-x-4" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
export type { SwitchProps };
