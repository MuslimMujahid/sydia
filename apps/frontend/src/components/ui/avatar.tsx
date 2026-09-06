import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

type AvatarProps = ComponentProps<"span"> & {
  initials: string;
  /** Show a presence indicator dot. */
  presence?: boolean;
};

function Avatar({
  className,
  initials,
  presence = false,
  ...props
}: AvatarProps) {
  return (
    <span
      data-slot="avatar"
      className={cn("relative inline-flex", className)}
      {...props}
    >
      <span className="flex size-10 items-center justify-center rounded-pill bg-ink font-display text-sm font-semibold text-background">
        {initials}
      </span>
      {presence ? (
        <span
          aria-hidden="true"
          className="absolute right-0 bottom-0 size-2.5 rounded-pill border-2 border-canvas bg-brand"
        />
      ) : null}
    </span>
  );
}

export { Avatar };
export type { AvatarProps };
