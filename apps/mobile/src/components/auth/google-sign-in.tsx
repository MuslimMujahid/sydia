import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/states";
import { authClient } from "@/lib/auth-client";

export function GoogleSignIn({ disabled }: { disabled?: boolean }) {
  const login = useMutation({
    mutationFn: async () => {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });
      if (result.error) {
        console.warn("Google sign-in failed", { code: result.error.code });
        throw new Error(
          result.error.code === "PROVIDER_NOT_FOUND"
            ? "Google belum tersedia. Gunakan email dan kata sandi."
            : result.error.message ||
                "Google belum dapat dihubungkan. Coba lagi."
        );
      }
    },
  });

  return (
    <>
      <Button
        label="Lanjutkan dengan Google"
        variant="outline"
        loading={login.isPending}
        disabled={disabled}
        onPress={() => login.mutate()}
      />
      <InlineError message={login.error?.message} />
    </>
  );
}
