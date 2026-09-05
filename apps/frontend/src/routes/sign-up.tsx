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
import { redirectAuthenticatedUser } from "@/lib/auth";
import { useSignUp } from "@/lib/services/api/auth/auth.queries";

const searchSchema = z.object({ redirect: z.string().optional() });
const signUpSchema = z
  .object({
    name: z.string().trim().min(2, "Masukkan minimal 2 karakter."),
    email: z.email("Masukkan alamat email yang valid."),
    password: z.string().min(8, "Gunakan minimal 8 karakter."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Kata sandi harus sama.",
  });

export const Route = createFileRoute("/sign-up")({
  validateSearch: searchSchema,
  beforeLoad: ({ context }) => redirectAuthenticatedUser(context.queryClient),
  head: () => ({
    meta: [
      { title: "Buat akun · Sydia" },
      { name: "description", content: "Buat akun Sydia Anda." },
    ],
  }),
  component: SignUpPage,
});

function SignUpPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const signUpMutation = useSignUp();
  const form = useAppForm({
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
    validators: { onChange: signUpSchema },
    onSubmit: async ({ value }) => {
      await signUpMutation.mutateAsync({
        name: value.name.trim(),
        email: value.email,
        password: value.password,
      });
      await navigate({ to: "/onboarding", replace: true });
    },
  });

  return (
    <AuthShell
      eyebrow="Buat akun Anda"
      title="Jadikan Sydia pusat aktivitas Anda."
      description="Akun Anda menyimpan tindakan terstruktur dan preferensi untuk Anda, bukan hanya di satu peramban."
      footer={
        <>
          Sudah memiliki akun?{" "}
          <Link
            to="/sign-in"
            search={{ redirect: search.redirect, reason: undefined }}
            className="font-semibold text-link underline underline-offset-4"
          >
            Masuk
          </Link>
        </>
      }
    >
      <form
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <FieldShell
              id="sign-up-name"
              label="Nama"
              errors={field.state.meta.errors}
            >
              {({ describedBy, invalid }) => (
                <TextField
                  id="sign-up-name"
                  name={field.name}
                  autoComplete="name"
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
        <form.Field name="email">
          {(field) => (
            <FieldShell
              id="sign-up-email"
              label="Email"
              errors={field.state.meta.errors}
            >
              {({ describedBy, invalid }) => (
                <TextField
                  id="sign-up-email"
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
              id="sign-up-password"
              label="Kata sandi"
              description="Minimal 8 karakter."
              errors={field.state.meta.errors}
            >
              {({ describedBy, invalid }) => (
                <TextField
                  id="sign-up-password"
                  name={field.name}
                  type="password"
                  autoComplete="new-password"
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
        <form.Field name="confirmPassword">
          {(field) => (
            <FieldShell
              id="sign-up-confirm-password"
              label="Konfirmasi kata sandi"
              errors={field.state.meta.errors}
            >
              {({ describedBy, invalid }) => (
                <TextField
                  id="sign-up-confirm-password"
                  name={field.name}
                  type="password"
                  autoComplete="new-password"
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
        <FormError message={signUpMutation.error?.message} />
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
        >
          {([canSubmit, isSubmitting]) => (
            <Button
              className="w-full"
              type="submit"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? "Membuat akun…" : "Buat akun"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthShell>
  );
}
