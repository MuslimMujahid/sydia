import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { CheckCircle2, Clock3, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  FieldShell,
  FormError,
  SelectField,
} from "@/components/forms/form-fields";
import { LoadingState, ErrorState } from "@/components/app-states";
import { useAppForm } from "@/lib/hooks/forms";
import { requireSession } from "@/lib/auth";
import {
  currentUserQueryOptions,
  useUpdateCurrentUser,
} from "@/lib/services/api/users/users.queries";

const onboardingSchema = z.object({
  timezone: z.string().min(1, "Choose a timezone."),
  locale: z.enum(["en", "id"]),
});

const TIMEZONES = [
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "UTC",
];

export const Route = createFileRoute("/onboarding")({
  beforeLoad: ({ context, location }) =>
    requireSession(context.queryClient, location.href),
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(
      currentUserQueryOptions()
    );

    if (user.onboardingCompleted) throw redirect({ to: "/" });

    return user;
  },
  head: () => ({
    meta: [
      { title: "Set your context · Sydia" },
      {
        name: "description",
        content: "Set timezone and language preferences for Sydia.",
      },
    ],
  }),
  pendingComponent: () => <LoadingState label="Preparing your account…" />,
  errorComponent: ({ error, reset }) => (
    <main className="grid min-h-screen place-items-center px-6">
      <ErrorState message={error.message} onRetry={reset} />
    </main>
  ),
  component: OnboardingPage,
});

function OnboardingPage() {
  const user = Route.useLoaderData();
  const navigate = useNavigate();
  const updateMutation = useUpdateCurrentUser();
  const form = useAppForm({
    defaultValues: {
      timezone: user.timezone || "Asia/Jakarta",
      locale: user.locale || "id",
    },
    validators: { onChange: onboardingSchema },
    onSubmit: async ({ value }) => {
      await updateMutation.mutateAsync({
        name: user.name,
        timezone: value.timezone,
        locale: value.locale,
        onboardingCompleted: true,
      });
      await navigate({ to: "/", replace: true });
    },
  });

  useEffect(() => {
    if (user.timezone) return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (
      detected &&
      (TIMEZONES.includes(detected) || detected.startsWith("Asia/"))
    )
      form.setFieldValue("timezone", detected);
  }, [form, user.timezone]);

  return (
    <main className="min-h-screen bg-surface-1/30 px-5 py-10 sm:px-8 lg:py-16">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10 max-w-2xl space-y-4">
          <p className="font-mono text-xs tracking-widest text-link uppercase">
            Account setup · 01
          </p>
          <h1 className="font-display text-4xl leading-tight font-extrabold sm:text-5xl">
            Set the context behind every time.
          </h1>
          <p className="text-lg text-ink-muted">
            Sydia uses these choices when interpreting phrases like “tomorrow
            morning” and formatting responses. You can change them later.
          </p>
        </header>
        <Card className="p-6 sm:p-8">
          <form
            className="space-y-7"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.Field name="timezone">
              {(field) => (
                <FieldShell
                  id="onboarding-timezone"
                  label="Timezone"
                  description="Controls reminder, event, and briefing times."
                  errors={field.state.meta.errors}
                >
                  {({ describedBy, invalid }) => (
                    <div className="relative">
                      <Clock3 className="pointer-events-none absolute top-3 left-3 size-4 text-ink-weak" />
                      <SelectField
                        className="pl-10"
                        id="onboarding-timezone"
                        value={field.state.value}
                        aria-describedby={describedBy}
                        aria-invalid={invalid}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                      >
                        {Array.from(new Set([field.state.value, ...TIMEZONES]))
                          .filter(Boolean)
                          .map((zone) => (
                            <option key={zone} value={zone}>
                              {zone.replaceAll("_", " ")}
                            </option>
                          ))}
                      </SelectField>
                    </div>
                  )}
                </FieldShell>
              )}
            </form.Field>
            <form.Field name="locale">
              {(field) => (
                <FieldShell
                  id="onboarding-locale"
                  label="Language"
                  description="Controls dashboard language and number/date formatting as translations roll out."
                  errors={field.state.meta.errors}
                >
                  {({ describedBy, invalid }) => (
                    <div className="relative">
                      <Languages className="pointer-events-none absolute top-3 left-3 size-4 text-ink-weak" />
                      <SelectField
                        className="pl-10"
                        id="onboarding-locale"
                        value={field.state.value}
                        aria-describedby={describedBy}
                        aria-invalid={invalid}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value as "en" | "id")
                        }
                      >
                        <option value="id">Bahasa Indonesia</option>
                        <option value="en">English</option>
                      </SelectField>
                    </div>
                  )}
                </FieldShell>
              )}
            </form.Field>
            <FormError message={updateMutation.error?.message} />
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" disabled={!canSubmit || isSubmitting}>
                  <CheckCircle2 />
                  {isSubmitting ? "Saving context…" : "Save and continue"}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </Card>
      </div>
    </main>
  );
}
