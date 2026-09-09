import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Radio, RadioGroup } from "@/components/ui/radio";
import {
  FieldShell,
  FormError,
  SelectField,
} from "@/components/forms/form-fields";
import { LoadingState, ErrorState } from "@/components/app-states";
import { useAppForm } from "@/lib/hooks/forms";
import { requireSession } from "@/lib/auth";
import {
  ASSISTANT_PERSONAS,
  DEFAULT_ASSISTANT_PERSONA,
  type AssistantPersona,
} from "@/lib/services/api/users/preferences.api";
import { useUpdateUserPreferences } from "@/lib/services/api/users/preferences.queries";
import {
  currentUserQueryOptions,
  useUpdateCurrentUser,
} from "@/lib/services/api/users/users.queries";
import { cn } from "@/lib/utils/cn";

const onboardingSchema = z.object({
  timezone: z.string().min(1, "Pilih zona waktu."),
  locale: z.enum(["en", "id"]),
  preferredAddress: z.string().max(50, "Panggilan maksimal 50 karakter."),
  persona: z.enum(ASSISTANT_PERSONAS),
});

const TIMEZONES = [
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "UTC",
];

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

const STEP_HEADINGS = [
  "Lokasi dan Bahasa",
  "Kamu mau dipanggil apa?",
  "Interaksi seperti apa yang kamu harapkan?",
] as const;

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
      { title: "Personalisasi Sydia · Sydia" },
      {
        name: "description",
        content: "Atur zona waktu, bahasa, panggilan, dan persona Sydia Anda.",
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
  const preferencesMutation = useUpdateUserPreferences();
  const form = useAppForm({
    defaultValues: {
      timezone: user.timezone || "Asia/Jakarta",
      locale: user.locale || "id",
      preferredAddress: "",
      persona: DEFAULT_ASSISTANT_PERSONA,
    },
    validators: { onChange: onboardingSchema },
    onSubmit: async ({ value }) => {
      const trimmed = value.preferredAddress.trim();
      await preferencesMutation.mutateAsync({
        preferredAddress: trimmed === "" ? null : trimmed,
        persona: value.persona,
      });
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

  const saving = updateMutation.isPending || preferencesMutation.isPending;
  const submitError =
    preferencesMutation.error?.message ?? updateMutation.error?.message;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const heading = STEP_HEADINGS[step - 1] ?? STEP_HEADINGS[0];

  const goToStep = (next: 1 | 2 | 3) => {
    preferencesMutation.reset();
    updateMutation.reset();
    setDirection(next > step ? "forward" : "backward");
    setStep(next);
  };

  return (
    <main className="min-h-screen bg-background px-5 py-10 sm:px-8 lg:py-16">
      <div className="mx-auto max-w-3xl">
        <div
          aria-label={`Langkah ${step} dari 3`}
          className="mb-5 grid grid-cols-3 gap-2"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={3}
          aria-valuenow={step}
        >
          {[1, 2, 3].map((item) => (
            <span
              key={item}
              aria-hidden="true"
              className={cn(
                "h-1 rounded-pill bg-ink/10 transition-[background-color,transform] duration-300 motion-reduce:transition-none",
                item <= step && "bg-brand",
                item === step && "scale-y-125"
              )}
            />
          ))}
        </div>
        <div
          key={step}
          className={cn(
            "animate-in fade-in duration-300 ease-out motion-reduce:animate-none",
            direction === "forward"
              ? "slide-in-from-right-3"
              : "slide-in-from-left-3"
          )}
        >
          <h1 className="mb-8 max-w-2xl font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em] text-ink sm:text-[44px] sm:leading-[1.1] sm:font-bold sm:tracking-[-0.03em]">
            {heading}
          </h1>
          <Card className="p-6 transition-shadow duration-300 sm:p-8">
            <form
              className="space-y-7"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (step !== 3) return;
                void form.handleSubmit();
              }}
            >
              {step === 1 && (
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
                          {Array.from(
                            new Set([field.state.value, ...TIMEZONES])
                          )
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
              )}
              {step === 1 && (
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
                            field.handleChange(
                              event.target.value as "en" | "id"
                            )
                          }
                        >
                          <option value="id">Bahasa Indonesia</option>
                          <option value="en">Bahasa Inggris</option>
                        </SelectField>
                      )}
                    </FieldShell>
                  )}
                </form.Field>
              )}
              {step === 2 && (
                <form.Field name="preferredAddress">
                  {(field) => (
                    <FieldShell
                      id="onboarding-preferred-address"
                      label="Panggilan"
                      description={`Opsional. Nama atau sapaan yang Sydia gunakan saat menyapa Anda; kosongkan jika ingin Sydia memilih secara natural. ${field.state.value.length}/50 karakter.`}
                      errors={field.state.meta.errors}
                    >
                      {({ describedBy, invalid }) => (
                        <Input
                          id="onboarding-preferred-address"
                          value={field.state.value}
                          maxLength={50}
                          placeholder="Mis. Kak Dipa, Bu Ratri"
                          autoComplete="off"
                          aria-describedby={describedBy}
                          aria-invalid={invalid}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                        />
                      )}
                    </FieldShell>
                  )}
                </form.Field>
              )}
              {step === 3 && (
                <form.Field name="persona">
                  {(field) => (
                    <fieldset>
                      <legend className="block font-sans text-sm font-semibold text-ink">
                        Persona asisten
                      </legend>
                      <p
                        id="onboarding-persona-description"
                        className="mt-2 text-sm text-ink-muted"
                      >
                        Menentukan cara Sydia berinteraksi dengan Anda.
                      </p>
                      <RadioGroup
                        aria-label="Persona asisten"
                        aria-describedby="onboarding-persona-description"
                        className="mt-4 grid gap-4 sm:grid-cols-2"
                        value={field.state.value}
                        onValueChange={(value) =>
                          field.handleChange(value as AssistantPersona)
                        }
                      >
                        {PERSONA_OPTIONS.map((option) => {
                          const selected = field.state.value === option.value;

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
                                  <Radio
                                    value={option.value}
                                    aria-label={option.label}
                                  />
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
                    </fieldset>
                  )}
                </form.Field>
              )}
              {step === 3 && <FormError message={submitError} />}
              <div
                className={cn(
                  "flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center",
                  step > 1 ? "sm:justify-between" : "sm:justify-end"
                )}
              >
                {step > 1 && (
                  <Button
                    type="button"
                    variant="dark-outline"
                    disabled={saving}
                    onClick={() => goToStep((step - 1) as 1 | 2 | 3)}
                  >
                    Kembali
                  </Button>
                )}
                {step < 3 ? (
                  <Button
                    type="button"
                    onClick={() => goToStep((step + 1) as 1 | 2 | 3)}
                  >
                    Lanjutkan
                  </Button>
                ) : (
                  <form.Subscribe
                    selector={(state) => [state.canSubmit, state.isSubmitting]}
                  >
                    {([canSubmit, isSubmitting]) => (
                      <Button
                        type="submit"
                        disabled={!canSubmit || isSubmitting || saving}
                      >
                        {isSubmitting || saving
                          ? "Menyimpan pengaturan…"
                          : "Simpan dan lanjutkan"}
                      </Button>
                    )}
                  </form.Subscribe>
                )}
              </div>
            </form>
          </Card>
        </div>
      </div>
    </main>
  );
}
