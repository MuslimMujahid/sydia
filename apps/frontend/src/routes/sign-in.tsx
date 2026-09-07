import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  FieldShell,
  FormError,
  TextField,
} from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { useAppForm } from "@/lib/hooks/forms";
import { redirectAuthenticatedUser, safeRedirectTarget } from "@/lib/auth";
import { useSignIn } from "@/lib/services/api/auth/auth.queries";
import { currentUserQueryOptions } from "@/lib/services/api/users/users.queries";

const searchSchema = z.object({
  redirect: z.string().optional(),
  reason: z.enum(["required", "expired", "signed-out"]).optional(),
});

const signInSchema = z.object({
  email: z.email("Masukkan alamat email yang valid."),
  password: z.string().min(1, "Masukkan kata sandi Anda."),
});

export const Route = createFileRoute("/sign-in")({
  validateSearch: searchSchema,
  beforeLoad: ({ context }) => redirectAuthenticatedUser(context.queryClient),
  head: () => ({
    meta: [
      { title: "Masuk · Sydia" },
      { name: "description", content: "Masuk ke pusat kendali Sydia Anda." },
    ],
  }),
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const context = Route.useRouteContext();
  const signInMutation = useSignIn();
  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    validators: { onChange: signInSchema },
    onSubmit: async ({ value }) => {
      await signInMutation.mutateAsync(value);
      const user = await context.queryClient.fetchQuery(
        currentUserQueryOptions()
      );

      const destination =
        user.role === "admin"
          ? "/admin"
          : user.onboardingCompleted
            ? safeRedirectTarget(search.redirect)
            : "/onboarding";

      await navigate({ to: destination, replace: true });
    },
  });

  const notice =
    search.reason === "expired"
      ? "Sesi Anda telah berakhir. Masuk kembali untuk melanjutkan."
      : search.reason === "required"
        ? "Masuk untuk membuka halaman tersebut."
        : search.reason === "signed-out"
          ? "Anda telah keluar."
          : null;

  return (
    <AuthShell
      eyebrow="Selamat datang kembali"
      title="Kembali ke ruang kerja Anda."
      description="Masuk untuk meninjau status akun dan preferensi yang tersimpan."
      footer={
        <>
          Baru menggunakan Sydia?{" "}
          <Link
            to="/sign-up"
            search={{ redirect: search.redirect }}
            className="font-semibold text-link underline underline-offset-4"
          >
            Buat akun
          </Link>
        </>
      }
    >
      {notice ? (
        <p className="mb-5 border-l-2 border-brand bg-surface-2 px-4 py-3 text-sm text-ink">
          {notice}
        </p>
      ) : null}
      <form
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="email">
          {(field) => (
            <FieldShell
              id="sign-in-email"
              label="Email"
              errors={field.state.meta.errors}
            >
              {({ describedBy, invalid }) => (
                <TextField
                  id="sign-in-email"
                  name={field.name}
                  type="email"
                  autoComplete="email"
                  value={field.state.value}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        <form.Field name="password">
          {(field) => (
            <FieldShell
              id="sign-in-password"
              label="Kata sandi"
              errors={field.state.meta.errors}
            >
              {({ describedBy, invalid }) => (
                <TextField
                  id="sign-in-password"
                  name={field.name}
                  type="password"
                  autoComplete="current-password"
                  value={field.state.value}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        <FormError message={signInMutation.error?.message} />
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
        >
          {([canSubmit, isSubmitting]) => (
            <Button
              className="w-full"
              type="submit"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? "Sedang masuk…" : "Masuk"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthShell>
  );
}
