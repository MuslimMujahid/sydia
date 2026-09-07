import { LogOut, MessageSquareText, ShieldCheck, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SydiaLogo } from "@/components/ui/sydia-logo";
import {
  authQueryKeys,
  useSignOut,
} from "@/lib/services/api/auth/auth.queries";
import {
  userQueryKeys,
  type UserProfile,
} from "@/lib/services/api/users/users.queries";

export function AdminShell({
  user,
  children,
}: {
  user: UserProfile;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signOutMutation = useSignOut();

  async function handleSignOut() {
    await signOutMutation.mutateAsync();
    queryClient.removeQueries({ queryKey: authQueryKeys.all });
    queryClient.removeQueries({ queryKey: userQueryKeys.all });
    await navigate({ to: "/admin/login", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-ink">
      <header className="border-b border-ink/8 bg-canvas">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 sm:px-8">
          <Link
            to="/admin"
            className="flex items-center gap-3 font-mono text-sm tracking-widest uppercase"
          >
            <SydiaLogo className="h-6" />
            Sydia Admin
          </Link>
          <nav
            aria-label="Navigasi admin"
            className="ml-4 hidden items-center gap-2 sm:flex"
          >
            <Link
              to="/admin"
              aria-current="page"
              className="flex items-center gap-2 rounded-md bg-surface-1 px-3 py-2 text-sm font-semibold"
            >
              <Users className="size-4 text-brand" />
              Pengguna
            </Link>
            <Link
              to="/admin/whatsapp"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-ink-muted hover:bg-surface-1 hover:text-ink"
            >
              <MessageSquareText className="size-4 text-brand" />
              WhatsApp
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{user.name}</p>
              <p className="text-xs text-ink-muted">{user.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Keluar dari portal admin"
              disabled={signOutMutation.isPending}
              onClick={() => void handleSignOut()}
            >
              <LogOut />
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 border-b border-ink/8 px-5 py-3 text-sm text-ink-muted sm:hidden">
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-brand" />
          Portal operasi · Pengguna
        </span>
        <Link to="/admin/whatsapp" className="font-semibold text-brand">
          WhatsApp
        </Link>
      </div>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
        {children}
      </main>
    </div>
  );
}
