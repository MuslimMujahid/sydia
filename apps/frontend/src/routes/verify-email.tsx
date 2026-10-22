import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { LockKeyhole } from "lucide-react";
import {
  authQueryKeys,
  sessionQueryOptions,
  authMethodsQueryOptions,
} from "@/lib/services/api/auth/auth.queries";
import {
  currentUserQueryOptions,
  userQueryKeys,
} from "@/lib/services/api/users/users.queries";
import {
  sendVerificationCode,
  verifyEmailCode,
} from "@/lib/services/api/auth/verification.api";
import {
  EmailCodeStep,
  EmailCorrectionLink,
  ReturnToSignIn,
} from "@/components/auth/email-code-step";
import { redirectAuthenticatedUser } from "@/lib/auth";
import { AuthRecoveryScreen } from "@/components/auth/auth-recovery-screen";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/verify-email")({
  staleTime: 0,
  gcTime: 0,
  shouldReload: true,
  validateSearch: z.object({
    reason: z.enum(["signup", "existing", "google"]).optional(),
  }),
  head: () => ({ meta: [{ title: "Verifikasi email · Sydia" }] }),
  loader: async ({ context }) => {
    const session = await context.queryClient.fetchQuery({
      ...sessionQueryOptions(),
      staleTime: 0,
    });

    if (!session) throw redirect({ to: "/sign-in" });
    if (session.user.emailVerified)
      await redirectAuthenticatedUser(context.queryClient);
    const methods = await context.queryClient.fetchQuery(
      authMethodsQueryOptions()
    );

    return { ...session, methods };
  },
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { user, methods } = Route.useLoaderData();
  const { reason } = Route.useSearch();
  const { queryClient } = Route.useRouteContext();
  const navigate = useNavigate();
  const [googleExplained, setGoogleExplained] = useState(false);
  const existing = reason !== "signup" && !methods.google;

  if (methods.google && !googleExplained)
    return (
      <AuthRecoveryScreen
        title="Verifikasi email diperlukan"
        message={
          "Email dari Google belum dapat diverifikasi.\nLanjutkan dengan kode yang dikirim ke email Anda."
        }
      >
        <Button
          className="h-12 w-full rounded-sm"
          onClick={() => setGoogleExplained(true)}
        >
          Verifikasi email
        </Button>
      </AuthRecoveryScreen>
    );

  return (
    <EmailCodeStep
      screen={existing ? "legacy" : "verify"}
      emailInBody={existing}
      email={user.email}
      title={
        methods.google
          ? "Verifikasi email diperlukan"
          : existing
            ? "Verifikasi email Anda"
            : "Periksa email Anda"
      }
      description={
        existing
          ? "Satu langkah untuk melanjutkan ke akun Anda."
          : "Masukkan kode 6 digit yang dikirim ke"
      }
      submitLabel={existing ? "Verifikasi dan lanjutkan" : "Verifikasi email"}
      autoSend
      sendCode={() => sendVerificationCode(user.email)}
      verifyCode={async (code) => {
        await verifyEmailCode(user.email, code);
        await queryClient.invalidateQueries({ queryKey: authQueryKeys.all });
        await queryClient.invalidateQueries({ queryKey: userQueryKeys.all });
        const account = await queryClient.fetchQuery({
          ...currentUserQueryOptions(),
          staleTime: 0,
        });

        await navigate({
          to:
            account.role === "admin"
              ? "/admin"
              : account.onboardingCompleted
                ? "/"
                : "/onboarding",
          replace: true,
        });
      }}
      notice={
        existing ? (
          <div className="mb-7 flex min-h-[82px] items-start gap-3 rounded-sm bg-ink/5 px-4 py-[14px] text-sm leading-[20.5px]">
            <LockKeyhole className="mt-0.5 size-[18px] shrink-0 text-ink-muted" />
            <p>
              Data dan kalender Anda tetap tersimpan.
              <br />
              Verifikasi email untuk membuka kembali akun.
            </p>
          </div>
        ) : undefined
      }
      secondary={
        <EmailCorrectionLink>
          {existing ? "Tidak bisa mengakses email ini?" : undefined}
        </EmailCorrectionLink>
      }
      footer={
        <ReturnToSignIn>
          {existing ? "Keluar dari akun" : "Kembali ke masuk"}
        </ReturnToSignIn>
      }
    />
  );
}
