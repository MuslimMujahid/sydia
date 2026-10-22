import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { VerificationShell } from "@/components/auth/verification-shell";
import { GoogleButton } from "@/components/auth/google-button";
import { AuthFieldsForm } from "@/components/auth/auth-fields-form";
import { requireSession } from "@/lib/auth";
import { requestAuth } from "@/lib/services/api/auth/verification.api";
import { authMethodsQueryOptions } from "@/lib/services/api/auth/auth.queries";

export const Route = createFileRoute("/link-google")({
  staleTime: 0,
  gcTime: 0,
  shouldReload: true,
  head: () => ({ meta: [{ title: "Hubungkan Google · Sydia" }] }),
  loader: async ({ context }) => {
    const session = await requireSession(context.queryClient, "/link-google");

    return {
      ...session,
      methods: await context.queryClient.fetchQuery(authMethodsQueryOptions()),
    };
  },
  component: LinkGooglePage,
});

function LinkGooglePage() {
  const { user, methods } = Route.useLoaderData();
  const confirm = useMutation({
    mutationFn: (password: string) =>
      requestAuth("registration/confirm-password", { password }),
  });

  return (
    <VerificationShell
      screen="link-google"
      title={
        methods.google ? "Google sudah terhubung" : "Hubungkan akun Google"
      }
      description="Tambahkan cara masuk ke akun Sydia Anda."
    >
      <div className="flex min-h-[60px] items-center gap-3 rounded-sm bg-ink/5 px-4 text-sm">
        <UserRound className="size-5 text-ink-muted" />
        {user.email}
      </div>
      <p className="mt-7 mb-[34px] text-[15px] leading-[22px] text-ink-muted">
        Setelah terhubung, Anda bisa masuk dengan
        <br />
        Google atau kata sandi. Data tetap di akun ini.
      </p>
      {!methods.google && (
        <>
          {!methods.confirmed && !confirm.isSuccess ? (
            <AuthFieldsForm
              fields={[
                {
                  name: "password",
                  label: "Kata sandi saat ini",
                  type: "password",
                  autoComplete: "current-password",
                },
              ]}
              submitLabel="Konfirmasi dan lanjutkan"
              pending={confirm.isPending}
              error={confirm.error?.message}
              onSubmit={async (values) => {
                await confirm.mutateAsync(values.password!);
              }}
            />
          ) : (
            <GoogleButton link destination="/settings/profile" />
          )}
        </>
      )}
      <Link
        to="/settings/profile"
        className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
      >
        {methods.google ? "Kembali ke profil" : "Nanti saja"}
      </Link>
    </VerificationShell>
  );
}
