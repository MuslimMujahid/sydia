import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Save } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  FieldShell,
  FormError,
  SelectField,
  TextField,
} from "@/components/forms/form-fields";
import { useAppForm } from "@/lib/hooks/forms";
import { useUpdateCurrentUser } from "@/lib/services/api/users/users.queries";
import {
  userPreferencesQueryOptions,
  useUpdateUserPreferences,
} from "@/lib/services/api/users/preferences.queries";

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
      { title: "Profil & preferensi · Sydia" },
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
  const preferencesQuery = useQuery(userPreferencesQueryOptions());
  const updatePreferencesMutation = useUpdateUserPreferences();
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
          Pengaturan / Identitas & interpretasi
        </p>
        <h1 className="font-display text-4xl font-extrabold sm:text-5xl">
          Profil & preferensi
        </h1>
        <p className="max-w-2xl text-lg text-ink-muted">
          Kelola informasi yang digunakan Sydia untuk menyapa Anda dan memahami
          waktu. Perubahan disimpan ke akun Anda.
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
          <FieldShell
            id="profile-email"
            label="Email"
            description="Perubahan email dikelola melalui akun autentikasi Anda."
          >
            {() => <TextField id="profile-email" value={user.email} disabled />}
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
                description="Menentukan bahasa antarmuka Sydia."
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
              Profil dan preferensi berhasil disimpan.
            </p>
          ) : null}
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <Button type="submit" disabled={!canSubmit || isSubmitting}>
                <Save />
                {isSubmitting ? "Menyimpan perubahan…" : "Simpan perubahan"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </Card>
      <Card className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-6">
          <div className="max-w-xl">
            <h2 className="font-display text-2xl font-bold">Memori otomatis</h2>
            <p
              id="automatic-memory-description"
              className="mt-2 text-ink-muted"
            >
              Izinkan Sydia memilih informasi berguna dari percakapan untuk
              disimpan sebagai memori. Riwayat chat tetap terpisah; setiap
              memori dapat diperiksa, dikoreksi, atau dihapus.
            </p>
          </div>
          {preferencesQuery.isPending ? (
            <span
              className="h-6 w-10 animate-pulse rounded-pill bg-hairline motion-reduce:animate-none"
              aria-label="Memuat preferensi memori"
            />
          ) : (
            <Switch
              aria-label="Aktifkan memori otomatis"
              aria-describedby="automatic-memory-description"
              checked={preferencesQuery.data?.automaticMemoryEnabled ?? false}
              disabled={
                preferencesQuery.isError || updatePreferencesMutation.isPending
              }
              onCheckedChange={(checked) =>
                updatePreferencesMutation.mutate({
                  automaticMemoryEnabled: checked,
                })
              }
            />
          )}
        </div>
        {preferencesQuery.isError ? (
          <div className="mt-5" role="alert">
            <p className="text-sm text-destructive">
              {preferencesQuery.error.message}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => void preferencesQuery.refetch()}
            >
              Coba lagi
            </Button>
          </div>
        ) : null}
        {updatePreferencesMutation.error ? (
          <p className="mt-5 text-sm text-destructive" role="alert">
            {updatePreferencesMutation.error.message}
          </p>
        ) : null}
        {updatePreferencesMutation.isSuccess ? (
          <p
            className="mt-5 flex items-center gap-2 text-sm text-editorial-deep"
            role="status"
          >
            <CheckCircle2 className="size-4" /> Preferensi memori disimpan.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
