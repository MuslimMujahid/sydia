import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/lib/utils/cn";

type InputProps = InputPrimitive.Props;

function Input({ className, ...props }: InputProps) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(
        "h-[38px] w-full rounded-sm border border-hairline bg-canvas px-3 py-2 font-sans text-base text-ink transition-colors outline-none placeholder:text-ink-muted hover:border-ink-weak focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/30 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  );
}

export { Input };
export type { InputProps };
