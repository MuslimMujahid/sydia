import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

type DividerProps = ComponentProps<"hr">;

function Divider({ className, ...props }: DividerProps) {
  return (
    <hr
      data-slot="divider"
      className={cn("border-0 border-t border-hairline", className)}
      {...props}
    />
  );
}

export { Divider };
export type { DividerProps };
