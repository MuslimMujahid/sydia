import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
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
  timezone: z.string().min(1, "Pilih zona waktu."),
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
      { title: "Atur konteks Anda · Sydia" },
      {
        name: "description",
        content: "Atur preferensi zona waktu dan bahasa untuk Sydia.",
      },
    ],
  }),
  pendingComponent: () => <LoadingState label="Menyiapkan akun Anda…" />,
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
    <main className="min-h-screen bg-background px-5 py-10 sm:px-8 lg:py-16">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10 max-w-2xl space-y-4">
          <p className="font-mono text-[13px] font-medium tracking-widest text-ink-muted uppercase">
            Pengaturan akun
          </p>
          <h1 className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em] sm:text-[44px] sm:leading-[1.1] sm:font-bold sm:tracking-[-0.03em]">
            Atur zona waktu dan bahasa Anda.
          </h1>
          <p className="text-[15px] leading-[1.6] text-ink-muted">
            Sydia menggunakan pilihan ini untuk memahami frasa seperti “besok
            pagi” dan memformat respons. Anda dapat mengubahnya nanti.
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
                  label="Zona waktu"
                  description="Menentukan waktu pengingat, acara, dan ringkasan."
                  errors={field.state.meta.errors}
                >
                  {({ describedBy, invalid }) => (
                    <SelectField
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
                  )}
                </FieldShell>
              )}
            </form.Field>
            <form.Field name="locale">
              {(field) => (
                <FieldShell
                  id="onboarding-locale"
                  label="Bahasa"
                  description="Menentukan bahasa dasbor serta format angka dan tanggal."
                  errors={field.state.meta.errors}
                >
                  {({ describedBy, invalid }) => (
                    <SelectField
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
                      <option value="en">Bahasa Inggris</option>
                    </SelectField>
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
                  {isSubmitting
                    ? "Menyimpan pengaturan…"
                    : "Simpan dan lanjutkan"}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </Card>
      </div>
    </main>
  );
}
