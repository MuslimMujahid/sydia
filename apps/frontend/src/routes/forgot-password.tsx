import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { VerificationShell } from "@/components/auth/verification-shell";
import { AuthRecoveryScreen } from "@/components/auth/auth-recovery-screen";
import { AuthFieldsForm } from "@/components/auth/auth-fields-form";
import { EmailCodeStep } from "@/components/auth/email-code-step";
import { requestAuth } from "@/lib/services/api/auth/verification.api";
import { ApiClientError } from "@/lib/services/api/api";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Pulihkan kata sandi · Sydia" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"email" | "code" | "password" | "done">(
    "email"
  );

  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const send = useMutation({
    mutationFn: (address: string) =>
      requestAuth("email-otp/request-password-reset", { email: address }),
    onSuccess: () => setStep("code"),
  });

  const reset = useMutation({
    mutationFn: (password: string) =>
      requestAuth("recovery/reset-password", { token, password }),
    onSuccess: () => {
      queryClient.clear();
      setToken("");
      setStep("done");
    },
  });

  if (
    send.error instanceof ApiClientError &&
    send.error.code === "RECOVERY_UNAVAILABLE"
  )
    return (
      <AuthRecoveryScreen
        title="Belum bisa memulihkan akun"
        message="Gunakan metode masuk yang sudah terhubung. Tanpa akses email atau login, pemulihan otomatis belum tersedia."
      >
        <div className="pt-[18px]">
          <Link
            to="/sign-in"
            className="aurora-gradient inline-flex min-h-12 w-full items-center justify-center rounded-sm px-5 text-[15px] font-semibold text-white"
          >
            Kembali ke masuk
          </Link>
        </div>
      </AuthRecoveryScreen>
    );

  if (step === "code")
    return (
      <EmailCodeStep
        screen="reset-verify"
        email={email}
        description="Masukkan kode pemulihan 6 digit untuk"
        submitLabel="Lanjutkan"
        alreadySent
        sendCode={() =>
          requestAuth("email-otp/request-password-reset", { email })
        }
        verifyCode={async (otp) => {
          const result = await requestAuth<{ token: string }>(
            "recovery/verify-code",
            { email, otp }
          );

          setToken(result.token);
          setStep("password");
        }}
        footer={<Link to="/sign-in">Kembali ke masuk</Link>}
      />
    );
  if (step === "done")
    return (
      <VerificationShell
        screen="reset-done"
        title="Kata sandi diperbarui"
        description="Silakan masuk menggunakan kata sandi baru."
      >
        <div
          role="status"
          className="mb-10 flex items-center gap-3 rounded-sm bg-ink/5 p-4 text-sm"
        >
          <CheckCircle2 className="size-5 text-ink-muted" />
          Semua sesi sebelumnya telah diakhiri.
        </div>
        <Link
          to="/sign-in"
          className="aurora-gradient inline-flex min-h-12 w-full items-center justify-center rounded-sm px-5 text-[15px] font-semibold text-white shadow-button"
        >
          Kembali ke masuk
        </Link>
      </VerificationShell>
    );

  return (
    <VerificationShell
      screen={step === "email" ? "forgot" : "reset-password"}
      title={step === "email" ? "Lupa kata sandi?" : "Buat kata sandi baru"}
      description={
        step === "email"
          ? "Masukkan email yang Anda gunakan di Sydia."
          : "Gunakan kata sandi yang belum pernah Anda pakai."
      }
      footer={
        step === "email" ? (
          <Link to="/sign-in">Kembali ke masuk</Link>
        ) : undefined
      }
    >
      {step === "email" ? (
        <AuthFieldsForm
          fields={[
            {
              name: "email",
              label: "Email",
              type: "email",
              autoComplete: "email",
              placeholder: "nama@contoh.com",
            },
          ]}
          submitLabel="Kirim kode pemulihan"
          pending={send.isPending}
          error={send.error?.message}
          beforeSubmit={
            <p className="-mt-1.5! pb-[15px] text-sm leading-[20.5px] text-ink-muted">
              Jika email terdaftar untuk login dengan kata sandi,
              <br className="hidden lg:block" /> kami akan mengirim kode untuk
              mengatur ulang.
            </p>
          }
          onSubmit={async (values) => {
            setEmail(values.email!);
            await send.mutateAsync(values.email!);
          }}
        />
      ) : (
        <AuthFieldsForm
          fields={[
            {
              name: "password",
              label: "Kata sandi baru",
              type: "password",
              autoComplete: "new-password",
              minLength: 8,
              placeholder: "Minimal 8 karakter",
            },
            {
              name: "confirmPassword",
              label: "Ulangi kata sandi baru",
              type: "password",
              autoComplete: "new-password",
              placeholder: "Masukkan lagi kata sandi baru",
            },
          ]}
          submitLabel="Simpan kata sandi baru"
          pending={reset.isPending}
          error={reset.error?.message}
          beforeSubmit={
            <div className="mt-[30px]! mb-8! flex min-h-[82px] items-start gap-3 rounded-sm bg-ink/5 px-4 py-[14px] text-sm leading-[20.5px]">
              <LockKeyhole className="mt-0.5 size-[18px] shrink-0 text-ink-muted" />
              <p>
                Setelah diubah, Anda akan keluar dari
                <br />
                semua perangkat dan perlu masuk lagi.
              </p>
            </div>
          }
          onSubmit={async (values) => {
            await reset.mutateAsync(values.password!);
          }}
        />
      )}
    </VerificationShell>
  );
}
