import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Radio, RadioGroup } from "@/components/ui/radio";
import {
  ASSISTANT_VERBOSITIES,
  DEFAULT_ASSISTANT_PERSONA,
  DEFAULT_ASSISTANT_VERBOSITY,
  type AssistantPersona,
  type AssistantVerbosity,
} from "@/lib/services/api/users/preferences.api";
import {
  userPreferencesQueryOptions,
  useUpdateUserPreferences,
} from "@/lib/services/api/users/preferences.queries";
import { WHATSAPP_INTEGRATION_ENABLED } from "@/lib/feature-flags";
import { SettingsPageHeader } from "./settings-nav";

const PERSONA_OPTIONS: {
  value: AssistantPersona;
  label: string;
  description: string;
}[] = [
  {
    value: "professional",
    label: "Profesional",
    description: "Formal dan terstruktur; jawaban rapi dengan bahasa baku.",
  },
  {
    value: "casual",
    label: "Gaul",
    description: "Santai dengan slang Indonesia khas gue/lo.",
  },
  {
    value: "supportive",
    label: "Suportif",
    description: "Hangat dan memahami, tanpa terasa seperti sesi terapi.",
  },
  {
    value: "firm",
    label: "Tegas",
    description:
      "Langsung dan blak-blakan, dengan sarkasme ringan yang tetap aman.",
  },
  {
    value: "motivator",
    label: "Motivator",
    description: "Penuh semangat dan selalu ditutup langkah konkret.",
  },
];

const VERBOSITY_LABELS: Record<
  AssistantVerbosity,
  { label: string; description: string }
> = {
  concise: {
    label: "Ringkas",
    description: "Jawaban singkat dan langsung ke intinya.",
  },
  balanced: {
    label: "Seimbang",
    description: "Cukup konteks tanpa bertele-tele.",
  },
  detailed: {
    label: "Mendetail",
    description: "Penjelasan lengkap dengan latar dan langkah.",
  },
};

export function AssistantSettingsPage() {
  const preferencesQuery = useQuery(userPreferencesQueryOptions());
  const updateMutation = useUpdateUserPreferences();
  const selectedPersona =
    (updateMutation.isPending
      ? updateMutation.variables?.persona
      : undefined) ??
    preferencesQuery.data?.persona ??
    DEFAULT_ASSISTANT_PERSONA;

  const selectedVerbosity =
    (updateMutation.isPending
      ? updateMutation.variables?.assistantVerbosity
      : undefined) ??
    preferencesQuery.data?.assistantVerbosity ??
    DEFAULT_ASSISTANT_VERBOSITY;

  const controlsDisabled = preferencesQuery.isError || updateMutation.isPending;

  return (
    <div className="max-w-3xl space-y-10">
      <SettingsPageHeader
        section="Asisten"
        title="Pengaturan asisten"
        description={
          WHATSAPP_INTEGRATION_ENABLED
            ? "Atur nada, gaya bahasa, dan panjang jawaban Sydia. Perubahan berlaku mulai pesan Anda berikutnya, di web maupun WhatsApp."
            : "Atur nada, gaya bahasa, dan panjang jawaban Sydia. Perubahan berlaku mulai pesan Anda berikutnya."
        }
      />
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
      <Card className="p-6 sm:p-8">
        <div className="max-w-xl">
          <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
            Gaya respons
          </h2>
          <p id="persona-description" className="mt-2 text-ink-muted">
            Menentukan nada dan gaya bahasa respons Sydia. Kemampuan, alat, dan
            standar keakuratan tidak berubah.
          </p>
        </div>
        {preferencesQuery.isPending ? (
          <div
            className="mt-6 space-y-3"
            aria-label="Memuat preferensi gaya respons"
          >
            {[0, 1, 2].map((row) => (
              <span
                key={row}
                className="block h-10 animate-pulse rounded-sm bg-hairline motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : (
          <RadioGroup
            aria-label="Gaya respons asisten"
            aria-describedby="persona-description"
            className="mt-6 space-y-1"
            value={selectedPersona}
            disabled={controlsDisabled}
            onValueChange={(value) =>
              updateMutation.mutate({ persona: value as AssistantPersona })
            }
          >
            {PERSONA_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex items-start gap-3 rounded-sm px-3 py-2.5"
              >
                <Radio value={option.value} className="mt-1" />
                <span>
                  <span className="block font-sans text-[15px] font-medium text-ink">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-muted">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        )}
      </Card>
      <Card className="p-6 sm:p-8">
        <div className="max-w-xl">
          <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
            Panjang jawaban
          </h2>
          <p id="verbosity-description" className="mt-2 text-ink-muted">
            Menentukan seberapa ringkas atau mendetail jawaban Sydia secara
            bawaan. Anda tetap dapat meminta jawaban lebih panjang atau lebih
            singkat kapan pun.
          </p>
        </div>
        {preferencesQuery.isPending ? (
          <div
            className="mt-6 space-y-3"
            aria-label="Memuat preferensi panjang jawaban"
          >
            {[0, 1, 2].map((row) => (
              <span
                key={row}
                className="block h-10 animate-pulse rounded-sm bg-hairline motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : (
          <RadioGroup
            aria-label="Panjang jawaban asisten"
            aria-describedby="verbosity-description"
            className="mt-6 space-y-1"
            value={selectedVerbosity}
            disabled={controlsDisabled}
            onValueChange={(value) =>
              updateMutation.mutate({
                assistantVerbosity: value as AssistantVerbosity,
              })
            }
          >
            {ASSISTANT_VERBOSITIES.map((value) => (
              <label
                key={value}
                className="flex items-start gap-3 rounded-sm px-3 py-2.5"
              >
                <Radio value={value} className="mt-1" />
                <span>
                  <span className="block font-sans text-[15px] font-medium text-ink">
                    {VERBOSITY_LABELS[value].label}
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-muted">
                    {VERBOSITY_LABELS[value].description}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        )}
      </Card>
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
          <CheckCircle2 className="size-4" /> Preferensi asisten disimpan.
        </p>
      ) : null}
    </div>
  );
}
