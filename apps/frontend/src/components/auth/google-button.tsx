import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/forms/form-fields";
import { requestAuth } from "@/lib/services/api/auth/verification.api";

export function GoogleMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M43.6 24.5c0-1.5-.1-3-.4-4.5H24v8.5h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.9 6-15.4Z"
      />
      <path
        fill="#34A853"
        d="M24 44c5.5 0 10.1-1.8 13.5-5l-6.7-5.2c-1.8 1.2-4.1 2-6.8 2-5.3 0-9.8-3.6-11.4-8.4H5.7v5.4A20.4 20.4 0 0 0 24 44Z"
      />
      <path
        fill="#FBBC05"
        d="M12.6 27.4a12.3 12.3 0 0 1 0-7.8v-5.4H5.7a20.4 20.4 0 0 0 0 18.6l6.9-5.4Z"
      />
      <path
        fill="#EA4335"
        d="M24 11.2c3 0 5.7 1 7.8 3l5.8-5.7A19.6 19.6 0 0 0 24 3 20.4 20.4 0 0 0 5.7 14.2l6.9 5.4A12 12 0 0 1 24 11.2Z"
      />
    </svg>
  );
}

interface GoogleButtonProps {
  link?: boolean;
  destination?: string;
}

export function GoogleButton({
  link = false,
  destination = "/",
}: GoogleButtonProps) {
  const connect = useMutation({
    mutationFn: async () => {
      const callbackURL = new URL(destination, window.location.origin).href;
      const errorCallbackURL = new URL("/google-result", window.location.origin)
        .href;

      const result = await requestAuth<{ url: string }>(
        link ? "link-social" : "sign-in/social",
        {
          provider: "google",
          callbackURL,
          errorCallbackURL,
        }
      );

      const target = new URL(result.url);

      if (
        target.protocol !== "https:" ||
        target.hostname !== "accounts.google.com"
      ) {
        console.error(
          "Google authorization returned an unexpected destination"
        );
        throw new Error("Google belum dapat dihubungkan. Silakan coba lagi.");
      }

      window.location.assign(target.href);
    },
  });

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant={link ? "primary" : "dark-outline"}
        className={
          link
            ? "relative h-12 w-full rounded-sm"
            : "relative h-12 w-full rounded-sm bg-white"
        }
        disabled={connect.isPending}
        onClick={() => connect.mutate()}
      >
        {!link && <GoogleMark className="absolute left-[18px] size-5" />}
        <span className={link ? undefined : "pl-8"}>
          {connect.isPending
            ? "Menghubungkan…"
            : link
              ? "Hubungkan akun Google"
              : "Lanjutkan dengan Google"}
        </span>
      </Button>
      <FormError message={connect.error?.message} />
    </div>
  );
}

export function AuthDivider() {
  return (
    <div className="relative mt-[22px] mb-[15px] flex items-center justify-center text-[13px] leading-[19px] text-ink-muted">
      <span className="absolute inset-x-0 h-px bg-ink/8" />
      <span className="relative bg-background px-4">atau</span>
    </div>
  );
}
