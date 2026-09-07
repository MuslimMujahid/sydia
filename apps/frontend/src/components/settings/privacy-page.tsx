import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { SelectField } from "@/components/forms/form-fields";
import { RETENTION_DAY_OPTIONS } from "@/lib/services/api/users/preferences.api";
import {
  userPreferencesQueryOptions,
  useUpdateUserPreferences,
} from "@/lib/services/api/users/preferences.queries";
import { SettingsPageHeader } from "./settings-nav";

export function PrivacySettingsPage() {
  const preferencesQuery = useQuery(userPreferencesQueryOptions());
  const updateMutation = useUpdateUserPreferences();
  const preferences = preferencesQuery.data;
  const controlsDisabled = preferencesQuery.isError || updateMutation.isPending;
  const retentionOptions = RETENTION_DAY_OPTIONS.includes(
    preferences?.retentionDays as (typeof RETENTION_DAY_OPTIONS)[number]
  )
    ? RETENTION_DAY_OPTIONS
    : preferences
      ? [...RETENTION_DAY_OPTIONS, preferences.retentionDays].sort(
          (left, right) => left - right
        )
      : RETENTION_DAY_OPTIONS;

  return (
    <div className="max-w-3xl space-y-10">
      <SettingsPageHeader
        section="Memori & privasi"
        title="Memori & privasi"
        description="Kendalikan apa yang Sydia ingat dari percakapan Anda dan berapa lama data disimpan."
      />
      {preferencesQuery.isPending ? (
        <div
          className="space-y-4"
          aria-busy="true"
          aria-label="Memuat preferensi privasi"
        >
          {[0, 1].map((row) => (
            <span
              key={row}
              className="block h-24 animate-pulse rounded-lg bg-surface-1 motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : null}
      {preferencesQuery.isError ? (
        <div className="border-y border-destructive/30 py-6" role="alert">
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
      {preferences ? (
        <>
          <Card className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-6">
              <div className="max-w-xl">
                <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
                  Memori otomatis
                </h2>
                <p
                  id="automatic-memory-description"
                  className="mt-2 text-ink-muted"
                >
                  Izinkan Sydia memilih informasi berguna dari percakapan untuk
                  disimpan sebagai memori. Riwayat chat tetap terpisah; setiap
                  memori dapat diperiksa, dikoreksi, atau dihapus di{" "}
                  <Link
                    to="/memory"
                    className="font-semibold text-link underline underline-offset-2"
                  >
                    halaman Memori
                  </Link>
                  .
                </p>
              </div>
              <Switch
                aria-label="Aktifkan memori otomatis"
                aria-describedby="automatic-memory-description"
                checked={preferences.automaticMemoryEnabled}
                disabled={controlsDisabled}
                onCheckedChange={(checked) =>
                  updateMutation.mutate({ automaticMemoryEnabled: checked })
                }
              />
            </div>
          </Card>
          <Card className="p-6 sm:p-8">
            <div className="max-w-xl">
              <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
                Retensi data
              </h2>
              <p id="retention-description" className="mt-2 text-ink-muted">
                Riwayat percakapan dan data turunan yang lebih tua dari batas
                ini dihapus otomatis oleh Sydia. Penghapusan berjalan berkala
                dan tidak dapat dibatalkan.
              </p>
            </div>
            <div className="mt-5 max-w-xs">
              <label
                htmlFor="retention-days"
                className="block font-sans text-sm font-semibold text-ink"
              >
                Simpan data selama
              </label>
              <SelectField
                id="retention-days"
                className="mt-2"
                aria-describedby="retention-description"
                value={String(preferences.retentionDays)}
                disabled={controlsDisabled}
                onChange={(event) =>
                  updateMutation.mutate({
                    retentionDays: Number(event.target.value),
                  })
                }
              >
                {retentionOptions.map((days) => (
                  <option key={days} value={days}>
                    {days} hari
                  </option>
                ))}
              </SelectField>
            </div>
          </Card>
        </>
      ) : null}
      {updateMutation.error ? (
        <p className="text-sm text-destructive" role="alert">
          {updateMutation.error.message}
        </p>
      ) : null}
      {updateMutation.isSuccess ? (
        <p
          className="flex items-center gap-2 text-sm text-editorial-deep"
          role="status"
        >
          <CheckCircle2 className="size-4" /> Preferensi privasi disimpan.
        </p>
      ) : null}
    </div>
  );
}
