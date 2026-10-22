import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { VerificationShell, type AuthScreen } from "./verification-shell";
import { OtpInput } from "./otp-input";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/forms/form-fields";
import { ApiClientError } from "@/lib/services/api/api";
import { signOut } from "@/lib/services/api/auth/auth.api";
import { cn } from "@/lib/utils/cn";

export function ReturnToSignIn({
  children = "Kembali ke masuk",
}: {
  children?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const leave = useMutation({
    mutationFn: signOut,
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: "/sign-in", replace: true });
    },
  });

  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
        disabled={leave.isPending}
        onClick={() => leave.mutate()}
      >
        {leave.isPending ? "Keluar…" : children}
      </button>
      <FormError message={leave.error?.message} />
    </>
  );
}

interface EmailCodeStepProps {
  screen?: AuthScreen;
  emailInBody?: boolean;
  email: string;
  title?: string;
  description?: string;
  submitLabel: string;
  sendCode: () => Promise<unknown>;
  verifyCode: (code: string) => Promise<unknown>;
  autoSend?: boolean;
  alreadySent?: boolean;
  footer?: ReactNode;
  secondary?: ReactNode;
  notice?: ReactNode;
}

export function EmailCodeStep({
  screen = "verify",
  emailInBody = false,
  email,
  title = "Periksa email Anda",
  description = "Masukkan kode 6 digit yang dikirim ke",
  submitLabel,
  sendCode,
  verifyCode,
  autoSend = false,
  alreadySent = false,
  footer,
  secondary,
  notice,
}: EmailCodeStepProps) {
  const [code, setCode] = useState("");
  const [remaining, setRemaining] = useState(alreadySent ? 60 : 0);
  const initialSend = useRef(false);
  const [failedAction, setFailedAction] = useState<"send" | "verify">("verify");

  const retryAfter = (error: Error) => {
    if (
      error instanceof ApiClientError &&
      typeof error.details?.retryAfter === "number"
    )
      setRemaining(Math.max(0, Math.ceil(error.details.retryAfter)));
  };

  const send = useMutation({
    mutationFn: sendCode,
    onSuccess: () => {
      setRemaining(60);
      setCode("");
    },
    onError: (error) => {
      setFailedAction("send");
      retryAfter(error);
    },
  });

  const verify = useMutation({
    mutationFn: () => verifyCode(code),
    onError: (error) => {
      setFailedAction("verify");
      retryAfter(error);
    },
  });

  const error = failedAction === "send" ? send.error : verify.error;
  const errorCode = error instanceof ApiClientError ? error.code : undefined;
  const sendInitialCode = send.mutate;
  useEffect(() => {
    if (autoSend && !initialSend.current) {
      initialSend.current = true;
      sendInitialCode();
    }
  }, [autoSend, sendInitialCode]);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setTimeout(
      () => setRemaining((value) => Math.max(0, value - 1)),
      1000
    );

    return () => window.clearTimeout(timer);
  }, [remaining]);
  const clock = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;

  const resetErrors = () => {
    verify.reset();
    send.reset();
  };

  const resend = () => {
    resetErrors();
    setFailedAction("send");
    send.mutate();
  };

  if (error) {
    const expired = errorCode === "OTP_EXPIRED";
    const attempts = errorCode === "TOO_MANY_ATTEMPTS";
    const limited =
      errorCode === "AUTH_RATE_LIMITED" || errorCode === "TOO_MANY_REQUESTS";

    const fresh =
      errorCode === "FRESH_AUTH_REQUIRED" || errorCode === "SESSION_REQUIRED";

    const wrong = errorCode === "INVALID_OTP";
    const attemptsRemaining =
      error instanceof ApiClientError &&
      typeof error.details?.attemptsRemaining === "number" &&
      Number.isInteger(error.details.attemptsRemaining) &&
      error.details.attemptsRemaining >= 1 &&
      error.details.attemptsRemaining <= 4
        ? error.details.attemptsRemaining
        : undefined;

    const heading = fresh
      ? "Konfirmasi akun Anda kembali"
      : limited
        ? "Tunggu sebelum mencoba lagi"
        : expired
          ? "Kode sudah kedaluwarsa"
          : attempts
            ? "Batas percobaan tercapai"
            : wrong
              ? "Kode belum cocok"
              : failedAction === "send"
                ? "Kode belum terkirim"
                : "Verifikasi belum berhasil";

    const explanation = expired
      ? "Minta kode baru untuk melanjutkan.\nKode sebelumnya tidak bisa digunakan."
      : attempts
        ? "Kode dinonaktifkan setelah 5 percobaan salah.\nMinta kode baru untuk melanjutkan."
        : limited
          ? "Terlalu banyak permintaan kode.\nCoba lagi setelah waktu tunggu berakhir."
          : errorCode === "AUTH_DELIVERY_FAILED"
            ? "Email verifikasi gagal dikirim.\nPeriksa alamat email Anda, lalu coba lagi."
            : error.message;

    return (
      <VerificationShell title={heading} description={null} screen="recovery">
        <div
          role="alert"
          className="mb-[34px] flex min-h-[82px] items-start gap-3 rounded-sm bg-destructive/5 px-4 py-[14px] text-sm leading-[20.5px] text-red-700"
        >
          <AlertCircle className="mt-0.5 size-[18px] shrink-0" />
          <p className="whitespace-pre-line">
            {wrong && attemptsRemaining !== undefined ? (
              <>
                Periksa kembali kode di email Anda.
                <br />
                Sisa percobaan: {attemptsRemaining}.
              </>
            ) : (
              explanation
            )}
          </p>
        </div>
        {wrong && (
          <div className="mb-[34px]">
            <OtpInput
              value={code}
              onChange={setCode}
              invalid
              showExpiryHint={false}
            />
          </div>
        )}
        {fresh ? (
          <ReturnToSignIn>Masuk dan konfirmasi kembali</ReturnToSignIn>
        ) : (
          <Button
            className="h-12 w-full rounded-sm"
            disabled={
              send.isPending || ((expired || attempts) && remaining > 0)
            }
            onClick={
              expired || attempts || (failedAction === "send" && !limited)
                ? resend
                : resetErrors
            }
          >
            {send.isPending
              ? "Mengirim kode…"
              : limited
                ? "Kembali ke verifikasi"
                : expired || attempts
                  ? remaining > 0
                    ? `Kirim kode baru dalam ${clock}`
                    : "Minta kode baru"
                  : failedAction === "send"
                    ? "Coba kirim lagi"
                    : "Coba lagi"}
          </Button>
        )}
        {secondary && <div className="mt-4">{secondary}</div>}
      </VerificationShell>
    );
  }

  return (
    <VerificationShell
      screen={screen}
      title={title}
      description={
        <>
          <p>{description}</p>
          {!emailInBody && (
            <p className="mt-1 font-semibold text-ink">{email}</p>
          )}
        </>
      }
      footer={footer}
    >
      {notice}
      {emailInBody && (
        <p className="mb-5 text-sm leading-5 text-ink-muted">
          Kode dikirim ke {email}
        </p>
      )}
      <form
        method="post"
        onSubmit={(event) => {
          event.preventDefault();

          if (code.length === 6 && !verify.isPending) {
            setFailedAction("verify");
            verify.mutate();
          }
        }}
      >
        <OtpInput
          value={code}
          onChange={setCode}
          disabled={verify.isPending}
          showExpiryHint={!emailInBody}
        />
        <Button
          type="submit"
          className={cn(
            "h-12 w-full rounded-sm disabled:bg-ink/6 disabled:text-ink-muted disabled:opacity-100 disabled:shadow-none disabled:[background-image:none]",
            emailInBody ? "mt-[30px]" : "mt-7"
          )}
          disabled={code.length !== 6 || verify.isPending}
        >
          {verify.isPending ? "Memverifikasi…" : submitLabel}
        </Button>
      </form>
      <button
        type="button"
        className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
        disabled={remaining > 0 || send.isPending}
        onClick={resend}
      >
        {send.isPending
          ? "Mengirim kode…"
          : remaining > 0
            ? `Kirim ulang dalam ${clock}`
            : "Kirim ulang kode"}
      </button>
      <span className="sr-only" role="status">
        {remaining === 0
          ? "Kode baru dapat diminta."
          : "Tunggu sebelum meminta kode baru."}
      </span>
      {secondary && <div className="mt-1">{secondary}</div>}
    </VerificationShell>
  );
}

export function EmailCorrectionLink({
  children = "Email salah? Ubah email",
}: {
  children?: ReactNode;
}) {
  return (
    <Link
      to="/change-email"
      className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
    >
      {children}
    </Link>
  );
}
