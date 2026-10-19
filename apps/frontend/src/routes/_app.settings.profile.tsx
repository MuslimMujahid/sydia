import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { DomainPageHeader } from "@/components/domain/domain-page";
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
import { SignInMethods } from "@/components/settings/sign-in-methods";
import "@/components/auth/auth.css";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Masukkan minimal 2 karakter."),
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

export const Route = createFileRoute("/_app/settings/profile")({
  head: () => ({
    meta: [
      { title: "Profil · Sydia" },
      {
        name: "description",
        content: "Kelola profil, zona waktu, dan bahasa Anda di Sydia.",
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
    <div className="auth-surface flex max-w-3xl flex-col gap-7 pt-1 sm:pt-0 lg:gap-10">
      <DomainPageHeader title="Profil" divided={false} />
      <Card className="min-h-[586px] rounded-md p-6 pt-7 shadow-none sm:min-h-[554px] sm:p-8 sm:pt-7 sm:pb-6">
        <form
          className="space-y-6 [&_input]:h-12 [&_select]:h-12 [&_#profile-timezone-description]:text-xs [&_#profile-timezone-description]:leading-[18px]"
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
                label="Nama"
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
          <FieldShell id="profile-email" label="Email">
            {() => (
              <>
                <TextField
                  id="profile-email"
                  value={user.email}
                  disabled
                  className="disabled:opacity-100"
                />
                <div className="flex h-4 items-center justify-between gap-3 text-[13px] leading-[19px] text-ink-muted">
                  <span>Email terverifikasi</span>
                  <Link
                    to="/change-email"
                    className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-4"
                  >
                    Ubah email
                  </Link>
                </div>
              </>
            )}
          </FieldShell>
          <form.Field name="timezone">
            {(field) => (
              <FieldShell
                id="profile-timezone"
                label="Zona waktu"
                description="Digunakan untuk memahami waktu relatif dan menjadwalkan tindakan berikutnya."
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
                label="Bahasa"
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
                    <option value="en">Bahasa Inggris</option>
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
              Profil berhasil disimpan.
            </p>
          ) : null}
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <Button
                className="mt-0.5 h-12 w-full sm:w-[204px]"
                type="submit"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? "Menyimpan perubahan…" : "Simpan perubahan"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </Card>
      <SignInMethods />
    </div>
  );
}
