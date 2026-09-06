import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/lib/utils/cn";

type SwitchProps = SwitchPrimitive.Root.Props;

function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-6 w-10 shrink-0 items-center rounded-pill bg-ink/10 p-0.5 outline-none data-[checked]:bg-brand data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[focused]:outline-2 data-[focused]:outline-offset-2 data-[focused]:outline-brand/50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="size-5 rounded-pill bg-canvas transition-transform data-[checked]:translate-x-4" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
export type { SwitchProps };
