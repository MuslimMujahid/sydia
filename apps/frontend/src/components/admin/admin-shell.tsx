import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  House,
  LogOut,
  Menu,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { SydiaLogo } from "@/components/ui/sydia-logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  useSignOut,
  authQueryKeys,
} from "@/lib/services/api/auth/auth.queries";
import {
  userQueryKeys,
  type UserProfile,
} from "@/lib/services/api/users/users.queries";
import { cn } from "@/lib/utils/cn";
import { isAdminPeriod } from "./analytics/meta";

type NavItem = {
  to: "/admin" | "/admin/usage" | "/admin/costs" | "/admin/users";
  label: string;
  icon: LucideIcon;
};

const SECTIONS: ReadonlyArray<{ title: string; items: readonly NavItem[] }> = [
  {
    title: "ANALITIK",
    items: [
      { to: "/admin", label: "Ringkasan", icon: House },
      { to: "/admin/usage", label: "Penggunaan", icon: Activity },
      { to: "/admin/costs", label: "Biaya", icon: Wallet },
    ],
  },
  {
    title: "OPERASIONAL",
    items: [{ to: "/admin/users", label: "Pengguna", icon: Users }],
  },
];

function isCurrent(pathname: string, to: string): boolean {
  return to === "/admin"
    ? pathname === "/admin" || pathname === "/admin/"
    : pathname.startsWith(to);
}

type AdminShellProps = { user: UserProfile; children: ReactNode };

export function AdminShell({ user, children }: AdminShellProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signOut = useSignOut();
  const pathname = useLocation({ select: (location) => location.pathname });
  // The selected period follows the admin between analytics pages.
  const period = useLocation({
    select: (location) => {
      const value = (location.search as Record<string, unknown>).period;

      return isAdminPeriod(value) ? value : undefined;
    },
  });

  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const current = SECTIONS.flatMap((section) => section.items).find((item) =>
    isCurrent(pathname, item.to)
  );

  async function handleSignOut() {
    setSignOutError(null);

    try {
      await signOut.mutateAsync();
      queryClient.removeQueries({ queryKey: authQueryKeys.all });
      queryClient.removeQueries({ queryKey: userQueryKeys.all });
      queryClient.removeQueries({ queryKey: ["admin"] });
      await navigate({ to: "/admin/login", replace: true });
    } catch (error) {
      console.error("Admin sign out failed", error);
      setSignOutError("Belum dapat keluar. Coba lagi.");
    }
  }

  function navigation() {
    return (
      <>
        <Link
          to="/admin"
          className="flex items-center gap-2 px-5 py-5 text-[15px] font-semibold"
          onClick={() => setOpen(false)}
        >
          <SydiaLogo className="size-6" /> Sydia{" "}
          <span className="ml-2 rounded-full bg-brand/10 px-2 py-1 font-mono text-[9px] tracking-widest text-brand">
            ADMIN
          </span>
        </Link>
        <nav aria-label="Navigasi admin" className="space-y-1 px-3">
          {SECTIONS.map((section) => (
            <div key={section.title} className="pb-3">
              <p className="px-2 py-2.5 font-mono text-[10px] tracking-[0.15em] text-ink-muted">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map(({ to, label, icon: Icon }) => {
                  const selected = isCurrent(pathname, to);

                  return (
                    <Link
                      key={to}
                      to={to}
                      search={period ? { period } : {}}
                      aria-current={selected ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex h-10 items-center gap-3 rounded-[12px] px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand",
                        selected
                          ? "bg-surface-1 text-ink"
                          : "text-ink-muted hover:bg-surface-1 hover:text-ink"
                      )}
                    >
                      <Icon
                        className={cn("size-4", selected && "text-brand")}
                      />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-auto border-t border-ink/6 px-4 py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
              {user.name
                .split(" ")
                .slice(0, 2)
                .map((part) => part[0])
                .join("")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-ink-muted">{user.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Keluar dari portal admin"
              disabled={signOut.isPending}
              onClick={() => void handleSignOut()}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
          {signOutError && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {signOutError}
            </p>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-ink/6 bg-canvas lg:flex">
        {navigation()}
      </aside>
      <header className="flex h-14 items-center gap-4 border-b border-ink/6 bg-canvas px-4 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Buka navigasi admin"
          onClick={() => setOpen(true)}
        >
          <Menu />
        </Button>
        <SydiaLogo className="size-6" />
        <span className="text-sm font-semibold">
          {current?.label ?? "Admin"}
        </span>
      </header>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showClose={false}
          className="fixed inset-y-0 left-0 flex h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0"
        >
          <DialogTitle className="sr-only">Navigasi admin</DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-5 right-2"
            aria-label="Tutup navigasi admin"
            onClick={() => setOpen(false)}
          >
            <X />
          </Button>
          {navigation()}
        </DialogContent>
      </Dialog>
      <main className="mx-auto max-w-[1800px] px-5 py-7 sm:px-8 lg:ml-64 lg:px-10 lg:py-10">
        {children}
      </main>
    </div>
  );
}
