import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Radio, RadioGroup } from "@/components/ui/radio";
import {
  DEFAULT_ASSISTANT_PERSONA,
  type AssistantPersona,
} from "@/lib/services/api/users/preferences.api";
import {
  userPreferencesQueryOptions,
  useUpdateUserPreferences,
} from "@/lib/services/api/users/preferences.queries";
import { WHATSAPP_INTEGRATION_ENABLED } from "@/lib/feature-flags";
import { cn } from "@/lib/utils/cn";
import { SettingsPageHeader } from "./settings-nav";

const PERSONA_OPTIONS: {
  value: AssistantPersona;
  label: string;
  description: string;
  image: string;
  imageAlt: string;
}[] = [
  {
    value: "personal_assistant",
    label: "Asisten Pribadi",
    description:
      "Praktis, terorganisir, dan efisien; langsung mengurus apa yang Anda butuhkan.",
    image: "/images/personas/personal-assistant.webp",
    imageAlt: "Asisten mengatur kalender, tugas, dan dokumen.",
  },
  {
    value: "friend",
    label: "Teman",
    description:
      "Santai, personal, dan natural; seperti ngobrol dengan teman dekat yang memahami konteks Anda.",
    image: "/images/personas/friend.webp",
    imageAlt: "Dua teman berbincang dengan hangat.",
  },
  {
    value: "mentor",
    label: "Mentor",
    description:
      "Membimbing Anda mengambil keputusan lebih baik dan menjalankan rencana dengan lebih terarah.",
    image: "/images/personas/mentor.webp",
    imageAlt: "Mentor membimbing seseorang menuju tujuan.",
  },
  {
    value: "creative_partner",
    label: "Partner Kreatif",
    description:
      "Mengeksplorasi ide dan kemungkinan bersama Anda, lalu mengubahnya menjadi tindakan konkret.",
    image: "/images/personas/creative-partner.webp",
    imageAlt: "Dua partner mengembangkan berbagai ide kreatif.",
  },
];

export function AssistantSettingsPage() {
  const preferencesQuery = useQuery(userPreferencesQueryOptions());
  const updateMutation = useUpdateUserPreferences();
  const selectedPersona =
    (updateMutation.isPending
      ? updateMutation.variables?.persona
      : undefined) ??
    preferencesQuery.data?.persona ??
    DEFAULT_ASSISTANT_PERSONA;

  const controlsDisabled = preferencesQuery.isError || updateMutation.isPending;
  const [addressDraft, setAddressDraft] = useState<string>();
  const addressValue =
    addressDraft ?? preferencesQuery.data?.preferredAddress ?? "";

  const addressControlsDisabled =
    preferencesQuery.isPending || controlsDisabled;

  const addressSaving =
    updateMutation.isPending &&
    updateMutation.variables !== undefined &&
    "preferredAddress" in updateMutation.variables;

  const handleAddressSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = addressValue.trim();
    setAddressDraft(trimmed);
    updateMutation.mutate({
      preferredAddress: trimmed === "" ? null : trimmed,
    });
  };

  return (
    <div className="max-w-3xl space-y-10">
      <SettingsPageHeader
        section="Asisten"
        title="Pengaturan asisten"
        description={
          WHATSAPP_INTEGRATION_ENABLED
            ? "Atur persona Sydia sesuai cara Anda ingin berinteraksi. Perubahan berlaku mulai pesan Anda berikutnya, di web maupun WhatsApp."
            : "Atur persona Sydia sesuai cara Anda ingin berinteraksi. Perubahan berlaku mulai pesan Anda berikutnya."
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
            Panggilan Pengguna
          </h2>
          <p id="preferred-address-description" className="mt-2 text-ink-muted">
            Nama atau sapaan yang Sydia gunakan saat menyapa atau merujuk Anda.
            Kosongkan jika Anda ingin Sydia memilih sapaan secara natural.
          </p>
        </div>
        {preferencesQuery.isPending ? (
          <div
            className="mt-6 max-w-sm"
            aria-label="Memuat preferensi panggilan"
          >
            <span className="block h-11 animate-pulse rounded-sm bg-hairline motion-reduce:animate-none" />
          </div>
        ) : (
          <form className="mt-6 max-w-sm" onSubmit={handleAddressSubmit}>
            <label
              htmlFor="preferred-address"
              className="block font-sans text-sm font-semibold text-ink"
            >
              Panggilan
            </label>
            <Input
              id="preferred-address"
              className="mt-2"
              aria-describedby="preferred-address-description preferred-address-count"
              value={addressValue}
              maxLength={50}
              placeholder="Mis. Kak Dipa, Bu Ratri"
              autoComplete="off"
              disabled={addressControlsDisabled}
              onChange={(event) => setAddressDraft(event.target.value)}
            />
            <p
              id="preferred-address-count"
              className="mt-1.5 text-xs text-ink-muted"
            >
              {addressValue.length}/50 karakter
            </p>
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              className="mt-4"
              disabled={addressControlsDisabled}
            >
              {addressSaving ? "Menyimpan…" : "Simpan panggilan"}
            </Button>
          </form>
        )}
      </Card>
      <Card className="p-6 sm:p-8">
        <div className="max-w-xl">
          <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
            Persona
          </h2>
          <p id="persona-description" className="mt-2 text-ink-muted">
            Menentukan cara Sydia berinteraksi dengan Anda. Kemampuan, alat, dan
            standar keakuratan tidak berubah.
          </p>
        </div>
        {preferencesQuery.isPending ? (
          <div
            className="mt-6 grid gap-4 sm:grid-cols-2"
            aria-label="Memuat preferensi persona"
          >
            {[0, 1, 2, 3].map((item) => (
              <span
                key={item}
                className="block aspect-[4/3] animate-pulse rounded-md bg-hairline motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : (
          <RadioGroup
            aria-label="Persona asisten"
            aria-describedby="persona-description"
            className="mt-6 grid gap-4 sm:grid-cols-2"
            value={selectedPersona}
            disabled={controlsDisabled}
            onValueChange={(value) =>
              updateMutation.mutate({ persona: value as AssistantPersona })
            }
          >
            {PERSONA_OPTIONS.map((option) => {
              const selected = selectedPersona === option.value;

              return (
                <label
                  key={option.value}
                  className={cn(
                    "group relative flex cursor-pointer flex-col overflow-hidden rounded-md border border-ink/8 bg-canvas transition-[border-color,background-color,box-shadow,transform] duration-160 hover:-translate-y-0.5 hover:border-ink/16 hover:shadow-sm has-[[data-focused]]:outline-2 has-[[data-focused]]:outline-offset-2 has-[[data-focused]]:outline-brand/50",
                    selected && "border-brand bg-brand/4 shadow-sm"
                  )}
                >
                  <span className="relative block aspect-[4/3] overflow-hidden bg-canvas-subtle">
                    <img
                      src={option.image}
                      alt={option.imageAlt}
                      className="size-full object-cover transition-transform duration-160 motion-safe:group-hover:scale-[1.02]"
                    />
                    <span className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-pill bg-canvas/90 shadow-sm">
                      <Radio value={option.value} />
                    </span>
                  </span>
                  <span className="flex flex-1 flex-col p-4">
                    <span className="block font-display text-[16px] leading-6 font-semibold text-ink">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-sm leading-5 text-ink-muted">
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            })}
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
