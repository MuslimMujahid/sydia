import {
  Bell,
  Brain,
  Cable,
  Database,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils/cn";

const SETTINGS_NAV_ITEMS = [
  { to: "/settings/profile", label: "Profil", icon: UserRound },
  { to: "/settings/assistant", label: "Asisten", icon: Sparkles },
  { to: "/settings/notifications", label: "Notifikasi", icon: Bell },
  { to: "/settings/integrations", label: "Integrasi", icon: Cable },
  { to: "/settings/privacy", label: "Memori & privasi", icon: Brain },
  { to: "/settings/data", label: "Data & akun", icon: Database },
] as const;

export function SettingsNav() {
  const location = useLocation();
  const activePath = location.pathname;

  return (
    <nav
      aria-label="Navigasi pengaturan"
      className="flex gap-1 overflow-x-auto lg:w-52 lg:shrink-0 lg:flex-col lg:gap-1.5"
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
              "flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold whitespace-nowrap outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50",
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
  section,
  title,
  description,
}: {
  section: string;
  title: string;
  description: string;
}) {
  return (
    <header className="space-y-4">
      <p className="font-mono text-[13px] font-medium tracking-widest text-ink-muted uppercase">
        Pengaturan / {section}
      </p>
      <h1 className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em]">
        {title}
      </h1>
      <p className="max-w-2xl text-[15px] leading-[1.6] text-ink-muted">
        {description}
      </p>
    </header>
  );
}
