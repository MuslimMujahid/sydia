import { cn } from "@/lib/utils/cn";

type SydiaLogoProps = {
  className?: string;
};

export function SydiaLogo({ className }: SydiaLogoProps) {
  return (
    <img
      src="/logo.svg"
      alt=""
      aria-hidden="true"
      className={cn("h-5 aspect-square shrink-0 object-contain", className)}
    />
  );
}

export type { SydiaLogoProps };
