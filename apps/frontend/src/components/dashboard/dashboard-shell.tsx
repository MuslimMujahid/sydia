import {
  Home,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  authQueryKeys,
  useSignOut,
} from "@/lib/services/api/auth/auth.queries";
import {
  userQueryKeys,
  type UserProfile,
} from "@/lib/services/api/users/users.queries";
import { SESSION_EXPIRED_EVENT } from "@/lib/services/api/api";
import { cn } from "@/lib/utils/cn";

const NAV_ITEMS = [
  { to: "/", label: "Hari ini", icon: Home },
  { to: "/settings/profile", label: "Profil & preferensi", icon: Settings },
] as const;

function initialsFor(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "SY"
  );
}

export function DashboardShell({
  user,
  children,
}: {
  user: UserProfile;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signOutMutation = useSignOut();
  const activePath = location.pathname;

  useEffect(() => {
    document.documentElement.lang = user.locale;

    const handleSessionExpired = () => {
      queryClient.removeQueries({ queryKey: authQueryKeys.all });
      queryClient.removeQueries({ queryKey: userQueryKeys.all });
      void navigate({
        to: "/sign-in",
        search: { redirect: location.href, reason: "expired" },
        replace: true,
      });
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);

    return () =>
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [location.href, navigate, queryClient, user.locale]);

  async function handleSignOut() {
    await signOutMutation.mutateAsync();
    queryClient.removeQueries({ queryKey: authQueryKeys.all });
    queryClient.removeQueries({ queryKey: userQueryKeys.all });
    await navigate({
      to: "/sign-in",
      search: { reason: "signed-out", redirect: undefined },
      replace: true,
    });
  }

  const navigation = (
    <nav aria-label="Navigasi utama" className="space-y-2">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active =
          item.to === "/" ? activePath === "/" : activePath.startsWith(item.to);

        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-brand/40",
              active
                ? "bg-brand text-ink"
                : "text-canvas/70 hover:bg-canvas/10 hover:text-canvas"
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-canvas text-ink lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-68 flex-col bg-canvas-dark px-5 py-6 text-canvas lg:flex">
        <Link
          to="/"
          className="flex items-center gap-3 px-3 font-mono text-sm tracking-widest uppercase"
        >
          <Sparkles className="size-5 text-brand" />
          Sydia
        </Link>
        <div className="mt-12 flex-1">{navigation}</div>
      </aside>
      <div className="lg:col-start-2">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-surface-1 bg-canvas/95 px-4 backdrop-blur sm:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={mobileOpen ? "Tutup navigasi" : "Buka navigasi"}
            aria-controls="mobile-navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X /> : <Menu />}
          </Button>
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    className="h-auto gap-3 px-2 py-1"
                    aria-label="Buka menu akun"
                  />
                }
              >
                <Avatar initials={initialsFor(user.name)} />
                <span className="hidden text-left sm:block">
                  <span className="block text-sm text-ink">{user.name}</span>
                  <span className="block text-xs font-normal text-ink-muted">
                    {user.email}
                  </span>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem render={<Link to="/settings/profile" />}>
                  <UserRound />
                  Profil & preferensi
                </DropdownMenuItem>
                <DropdownMenuItem
                  destructive
                  disabled={signOutMutation.isPending}
                  onClick={() => void handleSignOut()}
                >
                  <LogOut />
                  {signOutMutation.isPending ? "Sedang keluar…" : "Keluar"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        {mobileOpen ? (
          <div
            id="mobile-navigation"
            className="fixed inset-x-0 top-16 z-20 bg-canvas-dark p-4 text-canvas shadow-sm lg:hidden"
          >
            {navigation}
          </div>
        ) : null}
        <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
          {children}
        </main>
      </div>
    </div>
  );
}
