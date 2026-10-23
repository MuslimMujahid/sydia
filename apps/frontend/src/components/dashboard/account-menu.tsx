import { Link } from "@tanstack/react-router";
import {
  CreditCard,
  HardDrive,
  LogOut,
  Settings,
  Sparkles,
} from "lucide-react";
import { summarizeBillingPlan } from "@/components/settings/billing-plan";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BillingStatus } from "@/lib/services/api/billing/billing.api";
import type { UserProfile } from "@/lib/services/api/users/users.queries";
import { cn } from "@/lib/utils/cn";

interface AccountMenuProps {
  user: UserProfile;
  /** Undefined while loading or when the status could not be fetched. */
  billing: BillingStatus | undefined;
  collapsed: boolean;
  /** Avatar only, centered in its button (the mobile app bar). */
  compact?: boolean;
  signingOut: boolean;
  onSignOut: () => void;
}

export function initialsFor(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "SY"
  );
}

export function AccountMenu({
  user,
  billing,
  collapsed,
  compact = false,
  signingOut,
  onSignOut,
}: AccountMenuProps) {
  const plan = billing ? summarizeBillingPlan(billing) : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={cn(
              "h-auto min-w-0 max-w-full justify-start gap-3 px-2 py-2",
              (collapsed || compact) && "justify-center px-0",
              collapsed && "w-full",
              compact && "size-10 p-0"
            )}
            aria-label="Buka menu akun"
          />
        }
      >
        <Avatar initials={initialsFor(user.name)} />
        {!collapsed && !compact ? (
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm text-ink">{user.name}</span>
            <span
              className={cn(
                "block truncate text-xs font-normal text-ink-muted",
                plan?.state === "expired" && "text-destructive"
              )}
            >
              {plan ? plan.footer : user.email}
            </span>
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
          <DropdownMenuItem render={<Link to="/settings/profile" />}>
            <Settings /> Pengaturan
          </DropdownMenuItem>
          {plan ? (
            <>
              <DropdownMenuItem render={<Link to="/settings/billing" />}>
                <CreditCard /> Langganan
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link to="/settings/billing" />}>
                <HardDrive /> Penyimpanan
                <span className="ml-auto text-xs text-ink-weak tabular-nums">
                  {plan.storage}
                </span>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuGroup>
        {plan?.cta ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-ink"
              render={<Link to="/checkout" />}
            >
              <Sparkles /> {plan.cta}
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive disabled={signingOut} onClick={onSignOut}>
          <LogOut />
          {signingOut ? "Sedang keluar…" : "Keluar"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
