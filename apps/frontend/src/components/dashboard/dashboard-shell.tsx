import {
  Bell,
  Brain,
  CalendarDays,
  CheckSquare2,
  ContactRound,
  Files,
  LogOut,
  Menu,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Settings,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ConversationList } from "@/components/chat/conversation-list";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SydiaLogo } from "@/components/ui/sydia-logo";
import {
  authQueryKeys,
  useSignOut,
} from "@/lib/services/api/auth/auth.queries";
import type { ConversationSummary } from "@/lib/services/api/conversations/conversations.api";
import {
  conversationsQueryOptions,
  useDeleteConversation,
} from "@/lib/services/api/conversations/conversations.queries";
import { SESSION_EXPIRED_EVENT } from "@/lib/services/api/api";
import {
  userQueryKeys,
  type UserProfile,
} from "@/lib/services/api/users/users.queries";
import { cn } from "@/lib/utils/cn";

const DEBUG_ENABLED = import.meta.env.VITE_DEBUG_ENABLED === "true";

const NAV_ITEMS = [
  { to: "/tasks", label: "Tugas", icon: CheckSquare2 },
  { to: "/reminders", label: "Pengingat", icon: Bell },
  { to: "/calendar", label: "Kalender", icon: CalendarDays },
  { to: "/files", label: "File", icon: Files },
  { to: "/contacts", label: "Kontak", icon: ContactRound },
  { to: "/secrets", label: "Rahasia", icon: ShieldCheck },
  ...(DEBUG_ENABLED
    ? [{ to: "/memory" as const, label: "Memori", icon: Brain }]
    : []),
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
  const [collapsed, setCollapsed] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(
    null
  );

  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signOutMutation = useSignOut();
  const conversationsQuery = useQuery(conversationsQueryOptions());
  const deleteMutation = useDeleteConversation();
  const activePath = location.pathname;
  const selectedConversationId = new URLSearchParams(location.searchStr).get(
    "conversation"
  );

  const chatSurface = activePath === "/";

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

  async function openConversation(conversationId?: string) {
    setMobileOpen(false);
    await navigate({
      to: "/",
      search: { conversation: conversationId, attachment: undefined },
    });
  }

  async function handleDeleteConversation() {
    if (!deleteTarget) return;
    await deleteMutation.mutateAsync(deleteTarget.id);
    if (selectedConversationId === deleteTarget.id) await openConversation();
    setDeleteTarget(null);
  }

  const accountMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={cn(
              "h-auto min-w-0 justify-start gap-3 px-2 py-2",
              collapsed && "justify-center px-0"
            )}
            aria-label="Buka menu akun"
          />
        }
      >
        <Avatar initials={initialsFor(user.name)} />
        {!collapsed ? (
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm text-ink">{user.name}</span>
            <span className="block truncate text-xs font-normal text-ink-muted">
              {user.email}
            </span>
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link to="/settings/profile" />}>
          <Settings /> Pengaturan
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
  );

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("flex h-16 items-center px-3", !collapsed && "gap-3")}>
        <Link
          to="/"
          search={{ conversation: undefined, attachment: undefined }}
          aria-label="Sydia — chat baru"
          className={cn(
            "flex min-w-0 items-center gap-3 rounded-md px-2 outline-none focus-visible:outline-2 focus-visible:outline-brand/50",
            collapsed && "mx-auto"
          )}
        >
          <SydiaLogo className="h-6 shrink-0" />
          {!collapsed ? (
            <span className="font-display text-sm font-bold">Sydia</span>
          ) : null}
        </Link>
        {!collapsed ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto hidden lg:inline-flex"
            aria-label="Ciutkan sidebar"
            onClick={() => setCollapsed(true)}
          >
            <PanelLeftClose />
          </Button>
        ) : null}
      </div>

      <nav aria-label="Navigasi utama" className="space-y-1 px-3">
        <Link
          to="/"
          search={{ conversation: undefined, attachment: undefined }}
          onClick={() => setMobileOpen(false)}
          aria-current={
            chatSurface && !selectedConversationId ? "page" : undefined
          }
          className={cn(
            "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-brand/50",
            chatSurface && !selectedConversationId && "bg-surface-1 text-ink",
            collapsed && "justify-center px-0"
          )}
        >
          <MessageSquarePlus className="size-4 shrink-0" />
          {!collapsed ? (
            "Chat baru"
          ) : (
            <span className="sr-only">Chat baru</span>
          )}
        </Link>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activePath.startsWith(item.to);

          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold text-ink-muted outline-none hover:bg-surface-1 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand/50",
                active && "bg-surface-1 text-ink",
                collapsed && "justify-center px-0"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed ? item.label : null}
            </Link>
          );
        })}
      </nav>

      {!collapsed ? (
        <ConversationList
          conversations={conversationsQuery.data ?? []}
          selectedConversationId={chatSurface ? selectedConversationId : null}
          isLoading={conversationsQuery.isPending}
          errorMessage={conversationsQuery.error?.message}
          onSelect={(conversationId) => void openConversation(conversationId)}
          onRetry={() => void conversationsQuery.refetch()}
          onRequestDelete={setDeleteTarget}
          locale={user.locale}
        />
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          className="mx-auto mt-4 hidden lg:inline-flex"
          aria-label="Bentangkan sidebar"
          onClick={() => setCollapsed(false)}
        >
          <PanelLeftOpen />
        </Button>
      )}

      <div
        className={cn("mt-auto border-t border-ink/8 p-3", collapsed && "px-2")}
      >
        {accountMenu}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-ink">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r border-ink/8 bg-canvas transition-[width] duration-200 lg:block",
          collapsed ? "w-18" : "w-68"
        )}
      >
        {sidebar}
      </aside>

      <div
        className={cn(
          "min-w-0 transition-[padding] duration-200",
          collapsed ? "lg:pl-18" : "lg:pl-68"
        )}
      >
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-ink/8 bg-canvas px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label={mobileOpen ? "Tutup navigasi" : "Buka navigasi"}
            aria-controls="mobile-navigation"
            aria-expanded={mobileOpen}
            onClick={() => {
              setCollapsed(false);
              setMobileOpen((open) => !open);
            }}
          >
            {mobileOpen ? <X /> : <Menu />}
          </Button>
          <Link
            to="/"
            search={{ conversation: undefined, attachment: undefined }}
            className="ml-2 font-display text-sm font-bold"
          >
            Sydia
          </Link>
          <div className="ml-auto [&_button>span]:hidden">{accountMenu}</div>
        </header>

        {mobileOpen ? (
          <aside
            id="mobile-navigation"
            className="fixed inset-y-0 left-0 z-50 w-[min(20rem,88vw)] border-r border-ink/8 bg-canvas shadow-card lg:hidden"
          >
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-3 right-3 z-10"
              aria-label="Tutup navigasi"
              onClick={() => setMobileOpen(false)}
            >
              <X />
            </Button>
            {sidebar}
          </aside>
        ) : null}

        <main
          className={cn(
            "mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12",
            activePath === "/tasks" && "max-w-none",
            chatSurface &&
              "h-[calc(100dvh-4rem)] max-w-none overflow-hidden p-0 sm:p-0 lg:h-dvh lg:p-0"
          )}
        >
          {children}
        </main>
      </div>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            deleteMutation.reset();
          }
        }}
      >
        <DialogContent>
          <DialogTitle>Hapus percakapan ini?</DialogTitle>
          <DialogDescription className="mt-3">
            &ldquo;{deleteTarget?.title?.trim() || "Percakapan baru"}&rdquo;
            beserta seluruh pesan dan riwayatnya akan dihapus permanen.
          </DialogDescription>
          {deleteMutation.error ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {deleteMutation.error.message}
            </p>
          ) : null}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => void handleDeleteConversation()}
            >
              {deleteMutation.isPending ? "Menghapus…" : "Hapus permanen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
