import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
    value: "calm",
    label: "Tenang",
    description:
      "Stabil, sabar, dan tenang; tetap jernih saat situasi terasa rumit.",
    image: "/images/personas/calm.webp",
    imageAlt: "Sosok tenang menikmati suasana yang damai.",
  },
  {
    value: "cheerful",
    label: "Ceria",
    description:
      "Antusias, energik, dan optimistis; membuat tugas rutin terasa lebih ringan.",
    image: "/images/personas/cheerful.webp",
    imageAlt: "Sosok tersenyum lebar dengan energi positif.",
  },
  {
    value: "professional",
    label: "Profesional",
    description:
      "Terkendali, presisi, dan dapat diandalkan; jelas dan efisien tanpa berlebihan.",
    image: "/images/personas/professional.webp",
    imageAlt: "Asisten rapi menyusun berkas kerja dengan tenang.",
  },
  {
    value: "friendly",
    label: "Ramah",
    description:
      "Hangat, mudah diajak bicara, dan penuh perhatian; seperti mengobrol dengan seseorang yang Anda kenal.",
    image: "/images/personas/friendly.webp",
    imageAlt: "Dua sosok berbincang akrab dengan hangat.",
  },
  {
    value: "playful",
    label: "Jenaka",
    description:
      "Cerdas, santai, dan ekspresif; humor ringan yang tetap fokus pada tujuan Anda.",
    image: "/images/personas/playful.webp",
    imageAlt: "Sosok ceria melontarkan lelucon ringan.",
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
  const StepShell: "div" | typeof Card = step === 3 ? "div" : Card;

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
          <StepShell
            className={
              step === 3
                ? undefined
                : "p-6 transition-shadow duration-300 sm:p-8"
            }
          >
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
                    <>
                      {(() => {
                        const selectedIndex = Math.max(
                          0,
                          PERSONA_OPTIONS.findIndex(
                            (option) => option.value === field.state.value
                          )
                        );

                        const activeIndex = selectedIndex;
                        const previous = PERSONA_OPTIONS[selectedIndex - 1];
                        const next = PERSONA_OPTIONS[selectedIndex + 1];

                        return (
                          <>
                            <RadioGroup
                              aria-label="Persona asisten"
                              className="relative h-[305px] [--fan-gap:40px] sm:h-[355px] sm:[--fan-gap:92px] md:h-[400px] md:[--fan-gap:116px] lg:h-[425px] lg:[--fan-gap:136px]"
                              value={field.state.value}
                              onValueChange={(value) =>
                                field.handleChange(value as AssistantPersona)
                              }
                            >
                              {PERSONA_OPTIONS.map((option, index) => {
                                const selected =
                                  field.state.value === option.value;

                                const offset = index - activeIndex;
                                const distance = Math.abs(offset);
                                const active = distance === 0;

                                return (
                                  <label
                                    key={option.value}
                                    className={cn(
                                      "group absolute top-3 left-1/2 flex h-[260px] w-[150px] cursor-pointer flex-col overflow-hidden rounded-xl border bg-canvas transition-[transform,opacity,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:h-[305px] sm:w-[170px] md:h-[350px] md:w-[200px] lg:h-[370px] lg:w-[220px] has-[[data-focused]]:outline-2 has-[[data-focused]]:outline-offset-2 has-[[data-focused]]:outline-brand/50",
                                      selected
                                        ? "border-brand"
                                        : "border-ink/10",
                                      active ? "shadow-lg" : "shadow-sm"
                                    )}
                                    style={{
                                      transform: `translateX(calc(-50% + ${offset} * var(--fan-gap))) translateY(${distance * 10}px) rotate(${offset * 7}deg) scale(${active ? 1.03 : 1 - distance * 0.05})`,
                                      zIndex: 20 - distance,
                                      opacity: 1 - distance * 0.08,
                                    }}
                                  >
                                    <span className="relative block h-[56%] shrink-0 overflow-hidden bg-canvas-subtle">
                                      <img
                                        src={option.image}
                                        alt={option.imageAlt}
                                        draggable={false}
                                        className="size-full object-cover"
                                      />
                                      <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-pill bg-canvas/90 shadow-sm">
                                        <Radio
                                          value={option.value}
                                          aria-label={option.label}
                                        />
                                      </span>
                                    </span>
                                    <span className="flex flex-1 flex-col p-3">
                                      <span className="block font-display text-[13px] leading-5 font-semibold text-ink sm:text-[15px] sm:leading-6">
                                        {option.label}
                                      </span>
                                      <span className="mt-1 text-[11px] leading-4 text-ink-muted line-clamp-2 sm:text-xs sm:leading-5 sm:line-clamp-3">
                                        {option.description}
                                      </span>
                                      {option.value ===
                                        DEFAULT_ASSISTANT_PERSONA && (
                                        <span
                                          className={cn(
                                            "mt-auto inline-flex items-center gap-1 pt-1 text-[10px] font-medium text-brand transition-opacity duration-200 sm:text-[11px]",
                                            active ? "opacity-100" : "opacity-0"
                                          )}
                                        >
                                          <span aria-hidden="true">✦</span>
                                          Direkomendasikan
                                        </span>
                                      )}
                                    </span>
                                  </label>
                                );
                              })}
                            </RadioGroup>
                            <div className="mt-4 flex items-center justify-center gap-3">
                              <Button
                                type="button"
                                variant="dark-outline"
                                size="icon-sm"
                                className="rounded-pill"
                                aria-label="Persona sebelumnya"
                                disabled={previous === undefined}
                                onClick={() =>
                                  previous && field.handleChange(previous.value)
                                }
                              >
                                <ChevronLeft />
                              </Button>
                              <Button
                                type="button"
                                variant="dark-outline"
                                size="icon-sm"
                                className="rounded-pill"
                                aria-label="Persona berikutnya"
                                disabled={next === undefined}
                                onClick={() =>
                                  next && field.handleChange(next.value)
                                }
                              >
                                <ChevronRight />
                              </Button>
                            </div>
                          </>
                        );
                      })()}
                    </>
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
          </StepShell>
        </div>
      </div>
    </main>
  );
}
