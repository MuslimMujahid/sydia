import { cn } from "@/lib/utils/cn";

type SydiaLogoProps = {
  className?: string;
  /**
   * Fill utility for the dark half of the mark.
   * Pass `"fill-canvas"` on dark surfaces.
   */
  darkClassName?: string;
};

const MARK_PATH =
  "M 700 150 " +
  "L 1000 150 " +
  "C 1038 150 1051 172 1045 212 " +
  "C 1038 278 1014 320 964 352 " +
  "C 898 390 772 400 640 425 " +
  "C 726 466 802 542 856 646 " +
  "C 898 732 936 800 942 862 " +
  "C 950 920 938 970 910 1014 " +
  "C 884 960 860 892 848 810 " +
  "C 796 710 698 638 590 572 " +
  "C 510 534 446 502 406 458 " +
  "C 378 418 373 350 386 290 " +
  "C 407 222 487 168 600 153 " +
  "L 700 150 Z " +
  "M 700 150 " +
  "C 630 185 548 236 496 290 " +
  "C 462 324 458 366 482 398 " +
  "C 505 424 575 430 640 425 " +
  "C 620 406 608 370 606 326 " +
  "C 604 274 630 206 700 150 Z";

export function SydiaLogo({
  className,
  darkClassName = "fill-editorial",
}: SydiaLogoProps) {
  return (
    <svg
      viewBox="239 136 821 1011"
      aria-hidden="true"
      className={cn("h-5 w-auto", className)}
    >
      <path d={MARK_PATH} fillRule="evenodd" className="fill-brand" />
      <path
        d={MARK_PATH}
        fillRule="evenodd"
        transform="rotate(180 650 642)"
        className={darkClassName}
      />
    </svg>
  );
}

export type { SydiaLogoProps };
