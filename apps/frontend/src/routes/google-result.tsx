import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { VerificationShell } from "@/components/auth/verification-shell";
import { AuthFieldsForm } from "@/components/auth/auth-fields-form";
import { useSignIn } from "@/lib/services/api/auth/auth.queries";
import { AlertCircle } from "lucide-react";

export const Route = createFileRoute("/google-result")({
  validateSearch: z.object({ error: z.string().optional() }),
  head: () => ({ meta: [{ title: "Masuk dengan Google · Sydia" }] }),
  component: GoogleResultPage,
});

function GoogleResultPage() {
  const { error } = Route.useSearch();
  const collision =
    error === "account_not_linked" ||
    error === "account_already_linked_to_different_user";

  const signIn = useSignIn();
  const navigate = useNavigate();

  return (
    <VerificationShell
      screen={collision ? "google-collision" : "recovery"}
      title={collision ? "Akun Anda sudah ada" : "Belum masuk dengan Google"}
      description={
        collision
          ? "Masuk dengan metode sebelumnya untuk menghubungkan akun Google ini."
          : null
      }
      footer={
        collision ? <Link to="/sign-in">Kembali ke masuk</Link> : undefined
      }
    >
      {collision ? (
        <>
          <AuthFieldsForm
            fields={[
              {
                name: "email",
                label: "Email",
                type: "email",
                autoComplete: "email",
                placeholder: "nama@contoh.com",
              },
              {
                name: "password",
                label: "Kata sandi Sydia",
                type: "password",
                autoComplete: "current-password",
                placeholder: "Masukkan kata sandi Anda",
              },
            ]}
            submitLabel="Masuk dan lanjutkan"
            pending={signIn.isPending}
            error={signIn.error?.message}
            beforeSubmit={
              <div className="-mt-2! pb-[11px]">
                <Link
                  to="/forgot-password"
                  className="flex min-h-11 items-center text-sm font-semibold underline"
                >
                  Lupa kata sandi?
                </Link>
                <p className="mt-[18px] text-sm leading-[20.5px] text-ink-muted">
                  Kami tidak akan membuat akun kedua atau menggabungkan akun
                  secara otomatis.
                </p>
              </div>
            }
            onSubmit={async (values) => {
              const result = await signIn.mutateAsync({
                email: values.email!,
                password: values.password!,
              });

              await navigate({
                to: result.user.emailVerified
                  ? "/link-google"
                  : "/verify-email",
              });
            }}
          />
        </>
      ) : (
        <>
          <div
            role="alert"
            className="mb-[34px] flex min-h-[82px] items-start gap-3 rounded-sm bg-destructive/5 px-4 pt-[14px] pb-1.5 text-sm leading-[20.5px] text-red-700"
          >
            <AlertCircle className="mt-0.5 size-[18px] shrink-0" />
            <p>
              {error === "access_denied"
                ? "Proses masuk dibatalkan."
                : "Proses masuk belum berhasil."}
              <br />
              Anda dapat mencoba lagi atau memakai kata sandi.
            </p>
          </div>
          <Link
            to="/sign-in"
            className="aurora-gradient inline-flex min-h-12 w-full items-center justify-center rounded-sm px-5 text-[15px] font-semibold text-white"
          >
            Kembali ke masuk
          </Link>
        </>
      )}
    </VerificationShell>
  );
}
