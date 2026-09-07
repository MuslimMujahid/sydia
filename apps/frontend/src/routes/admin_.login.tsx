import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import {
  FieldShell,
  FormError,
  TextField,
} from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import { SydiaLogo } from "@/components/ui/sydia-logo";
import { isAdminRole, redirectAuthenticatedAdmin } from "@/lib/auth";
import { useAppForm } from "@/lib/hooks/forms";
import { useSignIn, useSignOut } from "@/lib/services/api/auth/auth.queries";
import { currentUserQueryOptions } from "@/lib/services/api/users/users.queries";

const searchSchema = z.object({
  redirect: z.string().optional(),
  reason: z.enum(["required", "expired", "signed-out"]).optional(),
});

const loginSchema = z.object({
  email: z.email("Masukkan alamat email admin yang valid."),
  password: z.string().min(1, "Masukkan kata sandi admin."),
});

export const Route = createFileRoute("/admin_/login")({
  validateSearch: searchSchema,
  beforeLoad: ({ context }) => redirectAuthenticatedAdmin(context.queryClient),
  head: () => ({
    meta: [
      { title: "Login admin · Sydia" },
      {
        name: "description",
        content: "Akses terbatas untuk administrator Sydia.",
      },
    ],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const context = Route.useRouteContext();
  const search = Route.useSearch();
  const signInMutation = useSignIn();
  const signOutMutation = useSignOut();
  const [accessError, setAccessError] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    validators: { onChange: loginSchema },
    onSubmit: async ({ value }) => {
      setAccessError(null);
      await signInMutation.mutateAsync(value);
      const user = await context.queryClient.fetchQuery({
        ...currentUserQueryOptions(),
        staleTime: 0,
      });

      if (!isAdminRole(user.role)) {
        await signOutMutation.mutateAsync();
        setAccessError("Akun ini tidak memiliki akses administrator.");

        return;
      }

      await navigate({ to: "/admin", replace: true });
    },
  });

  const notice =
    search.reason === "expired"
      ? "Sesi admin telah berakhir. Masuk kembali untuk melanjutkan."
      : search.reason === "signed-out"
        ? "Anda telah keluar dari portal admin."
        : search.reason === "required"
          ? "Masuk sebagai administrator untuk membuka halaman tersebut."
          : null;

  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-12">
      <section className="w-full max-w-md rounded-lg border border-ink/6 bg-canvas p-6 shadow-card sm:p-8">
        <div className="mb-10 flex items-center justify-between">
          <span className="flex items-center gap-3 font-mono text-sm tracking-widest uppercase">
            <SydiaLogo className="h-6" />
            Sydia Admin
          </span>
          <ShieldCheck className="size-5 text-brand" aria-hidden="true" />
        </div>
        <header className="mb-8 space-y-3">
          <h1 className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em] sm:text-[44px] sm:leading-[1.1] sm:font-bold sm:tracking-[-0.03em]">
            Login admin
          </h1>
          <p className="text-[15px] leading-[1.6] text-ink-muted">
            Akses terbatas untuk pengelolaan pengguna Sydia.
          </p>
        </header>
        {notice ? (
          <p className="mb-5 bg-surface-2 px-4 py-3 text-sm">{notice}</p>
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
                id="admin-email"
                label="Email admin"
                errors={field.state.meta.errors}
              >
                {({ describedBy, invalid }) => (
                  <TextField
                    id="admin-email"
                    name={field.name}
                    type="email"
                    autoComplete="username"
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
                id="admin-password"
                label="Kata sandi"
                errors={field.state.meta.errors}
              >
                {({ describedBy, invalid }) => (
                  <TextField
                    id="admin-password"
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
          <FormError
            message={
              accessError ??
              signInMutation.error?.message ??
              signOutMutation.error?.message
            }
          />
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <Button
                className="w-full"
                type="submit"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? "Memverifikasi…" : "Masuk ke portal admin"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </section>
    </main>
  );
}
