import {
  ExternalLink,
  LoaderCircle,
  MoreHorizontal,
  Unplug,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type CalendarConnectionProps = {
  isPending: boolean;
  error: string | null;
  connected: boolean | undefined;
  available: boolean | undefined;
  isConnecting: boolean;
  isDisconnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
};

/** Compact connection control for the page header; the calendar stays the page's focal point. */
export function CalendarConnection({
  isPending,
  error,
  connected,
  available,
  isConnecting,
  isDisconnecting,
  onConnect,
  onDisconnect,
}: CalendarConnectionProps) {
  if (isPending)
    return (
      <span className="text-sm text-ink-muted" role="status">
        Memeriksa koneksi…
      </span>
    );

  if (error)
    return (
      <span className="text-sm text-destructive" role="alert">
        {error}
      </span>
    );

  if (connected)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="dark-outline"
              size="sm"
              aria-label="Kelola koneksi kalender"
            />
          }
        >
          <Badge dot="brand">Google terhubung</Badge>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            destructive
            disabled={isDisconnecting}
            onClick={onDisconnect}
          >
            <Unplug />
            {isDisconnecting ? "Memutuskan…" : "Putuskan kalender"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

  if (available === false)
    return (
      <span className="text-sm text-ink-muted">
        Integrasi Google belum tersedia.
      </span>
    );

  return (
    <Button
      variant="dark-outline"
      size="sm"
      disabled={isConnecting}
      onClick={onConnect}
    >
      {isConnecting ? (
        <LoaderCircle className="animate-spin motion-reduce:animate-none" />
      ) : (
        <ExternalLink />
      )}
      {isConnecting ? "Menghubungkan…" : "Hubungkan Google"}
    </Button>
  );
}
