import { ExternalLink, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CalendarConnectionProps = {
  isPending: boolean;
  error: string | null;
  connected: boolean | undefined;
  googleEmail: string | null | undefined;
  available: boolean | undefined;
  isConnecting: boolean;
  onConnect: () => void;
};

/** Compact connection control for the page header; the calendar stays the page's focal point. */
export function CalendarConnection({
  isPending,
  error,
  connected,
  googleEmail,
  available,
  isConnecting,
  onConnect,
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
      <span className="flex min-w-0 items-center gap-2 text-sm text-ink-muted">
        <img
          src="/images/brands/google-calendar.svg"
          alt="Google Calendar"
          width={44}
          height={44}
          className="size-5 shrink-0 lg:size-11"
        />
        <span className="min-w-0 break-all">{googleEmail}</span>
      </span>
    );

  if (available === false) return null;

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
