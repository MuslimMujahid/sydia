import { cn } from "@/lib/utils/cn";

type SydiaLogoProps = {
  className?: string;
};

const TOP_SWASH =
  "M1049 149H650C527 149 430 211 398 300C359 410 418 486 504 535L831 720C928 778 949 895 899 1018C993 970 1050 889 1050 800C1050 702 1005 635 924 592L650 465C584 435 585 397 644 397H811C958 397 1050 301 1050 149Z";

const BOTTOM_SWASH =
  "M367 292C267 367 218 444 220 527C223 628 289 696 388 737L621 826C677 847 669 910 611 910H442C314 910 220 1000 220 1150H650C769 1150 850 1083 878 988C909 880 868 792 781 746L481 583C370 522 320 424 367 292Z";

export function SydiaLogo({ className }: SydiaLogoProps) {
  return (
    <svg
      viewBox="180 110 910 1080"
      aria-hidden="true"
      className={cn("h-5 w-auto", className)}
    >
      <path d={BOTTOM_SWASH} fill="#073f40" />
      <path d={TOP_SWASH} fill="#32e6e2" />
    </svg>
  );
}

export type { SydiaLogoProps };
