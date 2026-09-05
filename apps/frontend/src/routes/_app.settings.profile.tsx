import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Save } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  FieldShell,
  FormError,
  SelectField,
  TextField,
} from "@/components/forms/form-fields";
import { useAppForm } from "@/lib/hooks/forms";
import { useUpdateCurrentUser } from "@/lib/services/api/users/users.queries";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters."),
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

export const Route = createFileRoute("/_app/settings/profile")({
  head: () => ({
    meta: [
      { title: "Profile & preferences · Sydia" },
      {
        name: "description",
        content: "Manage your Sydia profile, timezone, and language.",
      },
    ],
  }),
  component: ProfileSettingsPage,
});

function ProfileSettingsPage() {
  const user = Route.useRouteContext();
  const updateMutation = useUpdateCurrentUser();
  const form = useAppForm({
    defaultValues: {
      name: user.name,
      timezone: user.timezone,
      locale: user.locale,
    },
    validators: { onChange: profileSchema },
    onSubmit: async ({ value }) => {
      await updateMutation.mutateAsync({
        ...value,
        name: value.name.trim(),
        onboardingCompleted: user.onboardingCompleted,
      });
    },
  });

  const timezoneOptions = TIMEZONES.includes(user.timezone)
    ? TIMEZONES
    : [user.timezone, ...TIMEZONES];

  return (
    <div className="max-w-3xl space-y-10">
      <header className="space-y-4">
        <p className="font-mono text-xs tracking-widest text-link uppercase">
          Settings / Identity & interpretation
        </p>
        <h1 className="font-display text-4xl font-extrabold sm:text-5xl">
          Profile & preferences
        </h1>
        <p className="max-w-2xl text-lg text-ink-muted">
          Keep the human details Sydia uses to address you and interpret time.
          Changes are saved to your account.
        </p>
      </header>
      <Card className="p-6 sm:p-8">
        <form
          className="space-y-7"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            updateMutation.reset();
            void form.handleSubmit();
          }}
        >
          <form.Field name="name">
            {(field) => (
              <FieldShell
                id="profile-name"
                label="Name"
                errors={field.state.meta.errors}
              >
                {({ describedBy, invalid }) => (
                  <TextField
                    id="profile-name"
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
          <FieldShell
            id="profile-email"
            label="Email"
            description="Email changes are managed by your authentication account."
          >
            {() => <TextField id="profile-email" value={user.email} disabled />}
          </FieldShell>
          <form.Field name="timezone">
            {(field) => (
              <FieldShell
                id="profile-timezone"
                label="Timezone"
                description="Used to interpret relative time and schedule future actions."
                errors={field.state.meta.errors}
              >
                {({ describedBy, invalid }) => (
                  <SelectField
                    id="profile-timezone"
                    value={field.state.value}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  >
                    {timezoneOptions.map((zone) => (
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
                id="profile-locale"
                label="Language"
                description="Keeps Bahasa Indonesia structurally supported as the interface expands."
                errors={field.state.meta.errors}
              >
                {({ describedBy, invalid }) => (
                  <SelectField
                    id="profile-locale"
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
                )}
              </FieldShell>
            )}
          </form.Field>
          <FormError message={updateMutation.error?.message} />
          {updateMutation.isSuccess ? (
            <p
              className="flex items-center gap-2 text-sm text-editorial-deep"
              role="status"
            >
              <CheckCircle2 className="size-4" />
              Profile and preferences saved.
            </p>
          ) : null}
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <Button type="submit" disabled={!canSubmit || isSubmitting}>
                <Save />
                {isSubmitting ? "Saving changes…" : "Save changes"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </Card>
    </div>
  );
}
