import { useState } from "react";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { VerificationShell } from "@/components/auth/verification-shell";
import { AuthRecoveryScreen } from "@/components/auth/auth-recovery-screen";
import { AuthFieldsForm } from "@/components/auth/auth-fields-form";
import { EmailCodeStep } from "@/components/auth/email-code-step";
import { GoogleMark } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/forms/form-fields";
import {
  sessionQueryOptions,
  authQueryKeys,
  authMethodsQueryOptions,
} from "@/lib/services/api/auth/auth.queries";
import {
  currentUserQueryOptions,
  userQueryKeys,
} from "@/lib/services/api/users/users.queries";
import { requestAuth } from "@/lib/services/api/auth/verification.api";
import { ApiClientError } from "@/lib/services/api/api";

export const Route = createFileRoute("/change-email")({
  staleTime: 0,
  gcTime: 0,
  shouldReload: true,
  validateSearch: z.object({
    confirmation: z.enum(["complete", "failed"]).optional(),
  }),
  loader: async ({ context }) => {
    const session = await context.queryClient.fetchQuery({
      ...sessionQueryOptions(),
      staleTime: 0,
    });

    if (!session) throw redirect({ to: "/sign-in" });
    const methods = await context.queryClient.fetchQuery(
      authMethodsQueryOptions()
    );

    return { ...session, methods };
  },
  head: () => ({ meta: [{ title: "Ubah email · Sydia" }] }),
  component: ChangeEmailPage,
});

function ChangeEmailPage() {
  const { user, methods } = Route.useLoaderData();
  const { confirmation } = Route.useSearch();
  const { queryClient } = Route.useRouteContext();
  const navigate = useNavigate();
  const [step, setStep] = useState<"identity" | "code" | "done">("identity");
  const [newEmail, setNewEmail] = useState("");
  const [googleMode, setGoogleMode] = useState(
    !methods.password || confirmation === "complete"
  );

  const googleConfirmed = methods.confirmationMethod === "google";
  const send = useMutation({
    mutationFn: (values: { newEmail: string; currentPassword?: string }) =>
      requestAuth("email-otp/request-email-change", values),
    onSuccess: () => setStep("code"),
  });

  const confirmGoogle = useMutation({
    mutationFn: async () => {
      const result = await requestAuth<{ url: string }>(
        "registration/google/confirm",
        {}
      );

      const target = new URL(result.url);

      if (
        target.protocol !== "https:" ||
        target.hostname !== "accounts.google.com"
      ) {
        console.error("Google confirmation destination rejected");
        throw new Error(
          "Konfirmasi Google belum dapat dimulai. Silakan coba lagi."
        );
      }

      window.location.assign(target.href);
    },
  });

  const continueToAccount = useMutation({
    mutationFn: async () => {
      const account = await queryClient.fetchQuery({
        ...currentUserQueryOptions(),
        staleTime: 0,
      });

      await navigate({
        to:
          account.role === "admin"
            ? "/admin"
            : account.onboardingCompleted
              ? "/settings/profile"
              : "/onboarding",
        replace: true,
      });
    },
  });

  const back = (
    <Link to={user.emailVerified ? "/settings/profile" : "/verify-email"}>
      {user.emailVerified ? "Kembali ke profil" : "Kembali ke verifikasi"}
    </Link>
  );

  const changeError =
    send.error instanceof ApiClientError ? send.error.code : undefined;

  if (
    changeError === "IDENTITY_REJECTED" ||
    changeError === "EMAIL_ALREADY_IN_USE"
  ) {
    const rejected = changeError === "IDENTITY_REJECTED";

    return (
      <AuthRecoveryScreen
        title={
          rejected ? "Konfirmasi akun belum berhasil" : "Email sudah digunakan"
        }
        message={
          rejected
            ? "Kata sandi tidak cocok.\nCoba lagi atau pulihkan kata sandi Anda."
            : "Gunakan alamat email lain.\nAkun dan data Anda belum berubah."
        }
      >
        <Button className="h-12 w-full rounded-sm" onClick={() => send.reset()}>
          {rejected ? "Coba lagi" : "Ubah alamat email"}
        </Button>
        {rejected && (
          <Link
            to="/forgot-password"
            className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
          >
            Lupa kata sandi?
          </Link>
        )}
      </AuthRecoveryScreen>
    );
  }

  if (step === "code")
    return (
      <EmailCodeStep
        screen="verify-email"
        email={newEmail}
        title="Verifikasi email baru"
        submitLabel="Verifikasi email baru"
        alreadySent
        sendCode={() =>
          requestAuth("email-otp/request-email-change", { newEmail })
        }
        verifyCode={async (otp) => {
          await requestAuth("email-otp/change-email", { newEmail, otp });
          await queryClient.invalidateQueries({ queryKey: authQueryKeys.all });
          await queryClient.invalidateQueries({ queryKey: userQueryKeys.all });
          setStep("done");
        }}
        secondary={
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
            onClick={() => {
              send.reset();
              setStep("identity");
            }}
          >
            Ubah alamat email
          </button>
        }
      />
    );
  if (step === "done")
    return (
      <VerificationShell
        screen="email-updated"
        title="Email berhasil diubah"
        description="Sekarang gunakan email ini untuk masuk."
      >
        <div
          role="status"
          className="flex min-h-[60px] items-start gap-3 rounded-sm bg-ink/5 px-4 py-[14px] text-sm leading-[20.5px]"
        >
          <CheckCircle2 className="mt-0.5 size-[18px] shrink-0 text-ink-muted" />
          {newEmail} sudah terverifikasi.
        </div>
        <p className="mt-7 mb-[38px] text-[15px] leading-[1.45] text-ink-muted">
          Data, pengaturan, dan koneksi kalender Anda
          <br />
          tetap tersimpan di akun yang sama.
        </p>
        <Button
          className="h-12 w-full rounded-sm"
          disabled={continueToAccount.isPending}
          onClick={() => continueToAccount.mutate()}
        >
          Lanjutkan ke akun
        </Button>
        <FormError message={continueToAccount.error?.message} />
      </VerificationShell>
    );
  const requiresGoogle = googleMode && !googleConfirmed;

  return (
    <VerificationShell
      screen={
        googleMode
          ? googleConfirmed
            ? "change-email-after-google"
            : "change-email-google"
          : "change-email"
      }
      title={
        googleMode
          ? googleConfirmed
            ? "Masukkan email baru"
            : "Konfirmasi akun Anda"
          : "Ubah alamat email"
      }
      description={
        googleMode
          ? googleConfirmed
            ? "Identitas Anda sudah dikonfirmasi dengan Google."
            : "Gunakan akun Google yang sudah terhubung."
          : "Konfirmasi akun Anda, lalu verifikasi email baru."
      }
      footer={back}
    >
      {!googleMode && (
        <p className="mb-[30px] text-[13px] leading-[19px] text-ink-muted">
          Email saat ini
          <strong className="mt-[5px] block text-[15px] leading-[22px] font-semibold text-ink">
            {user.email}
          </strong>
        </p>
      )}
      {requiresGoogle ? (
        <>
          <div className="mb-7 flex min-h-[60px] items-center gap-3 rounded-sm bg-ink/5 px-4 text-sm">
            <GoogleMark />
            <span>
              {methods.googleEmail
                ? `Akun terhubung: ${methods.googleEmail}`
                : "Email akun Google yang terhubung belum tersedia."}
            </span>
          </div>
          {confirmation === "failed" && (
            <p role="alert" className="mb-5 text-sm text-destructive">
              Konfirmasi akun belum berhasil. Pilih akun Google yang sudah
              terhubung, lalu coba lagi.
            </p>
          )}
          <Button
            className="relative h-12 w-full rounded-sm"
            disabled={confirmGoogle.isPending}
            onClick={() => confirmGoogle.mutate()}
          >
            <GoogleMark className="absolute left-[18px] size-5" />
            <span className="pl-8">Konfirmasi dengan Google</span>
          </Button>
          <FormError message={confirmGoogle.error?.message} />
          <p className="mt-[30px] pb-[29px] text-sm leading-[20.5px] text-ink-muted">
            Setelah konfirmasi, Anda dapat mengisi email baru.
            <br className="hidden lg:block" />
            Email lama tetap dipakai hingga verifikasi selesai.
          </p>
          {methods.password && (
            <button
              type="button"
              className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold underline"
              onClick={() => setGoogleMode(false)}
            >
              Gunakan kata sandi
            </button>
          )}
        </>
      ) : (
        <>
          <AuthFieldsForm
            fields={[
              ...(!googleMode
                ? [
                    {
                      name: "currentPassword",
                      label: "Kata sandi saat ini",
                      type: "password" as const,
                      autoComplete: "current-password",
                      placeholder: "Masukkan kata sandi",
                    },
                  ]
                : []),
              {
                name: "newEmail",
                label: "Email baru",
                type: "email",
                autoComplete: "email",
                placeholder: "nama@contoh.com",
              },
            ]}
            afterField={(field) =>
              field.name === "currentPassword" ? (
                <Link
                  to="/forgot-password"
                  className="-mt-1.5 flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
                >
                  Lupa kata sandi?
                </Link>
              ) : null
            }
            note={
              googleMode
                ? undefined
                : "Email lama diganti setelah email baru terverifikasi."
            }
            beforeSubmit={
              googleMode ? (
                <p className="pb-[31px] text-sm leading-[20.5px] text-ink-muted">
                  Email lama diganti setelah email baru terverifikasi.
                </p>
              ) : undefined
            }
            submitLabel="Kirim kode ke email baru"
            pending={send.isPending}
            error={send.error?.message}
            onSubmit={async (values) => {
              setNewEmail(values.newEmail!);
              await send.mutateAsync({
                newEmail: values.newEmail!,
                ...(!googleMode
                  ? { currentPassword: values.currentPassword! }
                  : {}),
              });
            }}
          />
          {methods.google && !googleMode && (
            <button
              type="button"
              className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
              onClick={() => setGoogleMode(true)}
            >
              Konfirmasi dengan Google yang terhubung
            </button>
          )}
        </>
      )}
    </VerificationShell>
  );
}
