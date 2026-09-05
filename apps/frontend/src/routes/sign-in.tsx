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
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const Route = createFileRoute("/sign-in")({
  validateSearch: searchSchema,
  beforeLoad: ({ context }) => redirectAuthenticatedUser(context.queryClient),
  head: () => ({
    meta: [
      { title: "Sign in · Sydia" },
      { name: "description", content: "Sign in to your Sydia control center." },
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

      const destination = user.onboardingCompleted
        ? safeRedirectTarget(search.redirect)
        : "/onboarding";

      await navigate({ to: destination, replace: true });
    },
  });

  const notice =
    search.reason === "expired"
      ? "Your session expired. Sign in again to continue where you left off."
      : search.reason === "required"
        ? "Sign in to open that page."
        : search.reason === "signed-out"
          ? "You’re signed out."
          : null;

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Return to your desk."
      description="Sign in to inspect your saved account state and preferences."
      footer={
        <>
          New to Sydia?{" "}
          <Link
            to="/sign-up"
            search={{ redirect: search.redirect }}
            className="font-semibold text-link underline underline-offset-4"
          >
            Create an account
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
              label="Password"
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
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthShell>
  );
}
