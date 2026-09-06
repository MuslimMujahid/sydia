import type {
  CategoryColor,
  CategoryIconKey,
} from "@/lib/services/api/categories/categories.api";
import { cn } from "@/lib/utils/cn";

const COLOR_CLASS: Record<CategoryColor, string> = {
  blue: "bg-blue-100 text-blue-700",
  violet: "bg-violet-100 text-violet-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  rose: "bg-rose-100 text-rose-700",
  cyan: "bg-cyan-100 text-cyan-700",
  orange: "bg-orange-100 text-orange-700",
};

const PATHS: Record<CategoryIconKey, React.ReactNode> = {
  briefcase: (
    <>
      <path d="M4 8h16v10H4z" fill="currentColor" opacity=".22" />
      <path d="M9 8V5h6v3M4 12h16M10 12v2h4v-2" />
    </>
  ),
  heart: (
    <path
      d="M12 20S4 15.5 4 9.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8 3.5C20 15.5 12 20 12 20Z"
      fill="currentColor"
      opacity=".28"
    />
  ),
  wallet: (
    <>
      <path d="M4 6h14v13H4z" fill="currentColor" opacity=".2" />
      <path d="M4 9h16v8H4M15 13h2" />
    </>
  ),
  book: (
    <>
      <path
        d="M3 5h7a2 2 0 0 1 2 2v12a3 3 0 0 0-3-3H3z"
        fill="currentColor"
        opacity=".2"
      />
      <path d="M21 5h-7a2 2 0 0 0-2 2v12a3 3 0 0 1 3-3h6z" />
    </>
  ),
  health: (
    <>
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity=".18" />
      <path d="M12 7v10M7 12h10" />
    </>
  ),
  family: (
    <>
      <circle cx="8" cy="9" r="3" fill="currentColor" opacity=".3" />
      <circle cx="16" cy="9" r="3" />
      <path d="M3 19c.5-4 9.5-4 10 0M11 19c.5-4 9.5-4 10 0" />
    </>
  ),
  shopping: (
    <>
      <path d="M5 8h14l-1 12H6z" fill="currentColor" opacity=".22" />
      <path d="M9 9V6a3 3 0 0 1 6 0v3" />
    </>
  ),
  star: (
    <path
      d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"
      fill="currentColor"
      opacity=".3"
    />
  ),
  home: (
    <>
      <path d="m3 11 9-8 9 8v10H3z" fill="currentColor" opacity=".2" />
      <path d="M9 21v-7h6v7" />
    </>
  ),
  travel: (
    <>
      <path d="m3 13 18-7-6 15-3-6z" fill="currentColor" opacity=".22" />
      <path d="m12 15 9-9" />
    </>
  ),
};

export function CategoryIcon({
  iconKey,
  color,
  className,
}: {
  iconKey: CategoryIconKey;
  color: CategoryColor;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-grid size-7 shrink-0 place-items-center rounded-lg",
        COLOR_CLASS[color],
        className
      )}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {PATHS[iconKey]}
      </svg>
    </span>
  );
}
