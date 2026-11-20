import type { AssistantPersona } from "@/lib/services/api/users/users.api";

export const DEFAULT_ASSISTANT_PERSONA: AssistantPersona = "professional";

export type PersonaOption = {
  value: AssistantPersona;
  label: string;
  description: string;
  image: number;
  imageAlt: string;
};

/** Persona copy and portraits shared with the web (components/onboarding/personas.ts). */
export const PERSONA_OPTIONS: PersonaOption[] = [
  {
    value: "professional",
    label: "Profesional",
    description:
      "Terkendali, presisi, dan dapat diandalkan; jelas dan efisien tanpa berlebihan.",
    image:
      require("../../../assets/images/personas/haruka_professional.webp") as number,
    imageAlt: "Asisten rapi menyusun berkas kerja dengan tenang.",
  },
  {
    value: "friendly",
    label: "Ramah",
    description:
      "Hangat, mudah diajak bicara, dan penuh perhatian; seperti mengobrol dengan seseorang yang Anda kenal.",
    image:
      require("../../../assets/images/personas/haruka_friendly.webp") as number,
    imageAlt: "Dua sosok berbincang akrab dengan hangat.",
  },
  {
    value: "cheerful",
    label: "Ceria",
    description:
      "Antusias, energik, dan optimistis; membuat tugas rutin terasa lebih ringan.",
    image:
      require("../../../assets/images/personas/haruka_cheerful.webp") as number,
    imageAlt: "Sosok tersenyum lebar dengan energi positif.",
  },
  {
    value: "playful",
    label: "Jenaka",
    description:
      "Cerdas, santai, dan ekspresif; humor ringan yang tetap fokus pada tujuan Anda.",
    image:
      require("../../../assets/images/personas/haruka_playful.webp") as number,
    imageAlt: "Sosok ceria melontarkan lelucon ringan.",
  },
];
