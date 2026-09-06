import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/lib/utils/cn";

type InputProps = InputPrimitive.Props;

function Input({ className, ...props }: InputProps) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(
        "h-11 w-full rounded-sm border border-ink/16 bg-canvas px-3 py-2 font-sans text-[15px] text-ink outline-none placeholder:text-ink-muted hover:border-brand/50 focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15 disabled:pointer-events-none disabled:bg-ink/4 disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15",
        className
      )}
      {...props}
    />
  );
}

export { Input };
export type { InputProps };
