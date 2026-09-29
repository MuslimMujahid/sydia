import { Bell, Cable, Sparkles, UserRound } from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";

const SETTINGS_NAV_ITEMS = [
  { to: "/settings/profile", label: "Profil", icon: UserRound },
  { to: "/settings/assistant", label: "Asisten", icon: Sparkles },
  { to: "/settings/notifications", label: "Notifikasi", icon: Bell },
  { to: "/settings/integrations", label: "Integrasi", icon: Cable },
] as const;

export function SettingsNav() {
  const location = useLocation();
  const activePath = location.pathname;
  const navRef = useRef<HTMLElement>(null);

  // On phones the row scrolls sideways; bring the current page's tab into view
  // without scrolling the page itself.
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;

    const overflowRight =
      active.offsetLeft +
      active.offsetWidth -
      (nav.scrollLeft + nav.clientWidth);

    const overflowLeft = nav.scrollLeft - active.offsetLeft;

    if (overflowRight > 0) nav.scrollLeft += overflowRight + 20;
    else if (overflowLeft > 0) nav.scrollLeft -= overflowLeft + 20;
  }, [activePath]);

  return (
    <nav
      ref={navRef}
      aria-label="Navigasi pengaturan"
      // Below `lg` this is a swipeable row that runs to the screen edges, like
      // the task status chips; from `lg` it is a side rail.
      className="relative -mx-5 flex gap-1 overflow-x-auto overscroll-x-contain scroll-px-5 px-5 [scrollbar-width:none] sm:-mx-8 sm:scroll-px-8 sm:px-8 lg:mx-0 lg:w-52 lg:shrink-0 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {SETTINGS_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = activePath.startsWith(item.to);

        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold whitespace-nowrap outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50",
              active
                ? "bg-surface-1 text-ink [&_svg]:text-brand"
                : "text-ink-muted hover:bg-surface-1 hover:text-ink"
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SettingsPageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="space-y-4">
      <h1 className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em]">
        {title}
      </h1>
      <p className="max-w-2xl text-[15px] leading-[1.6] text-ink-muted">
        {description}
      </p>
    </header>
  );
}
