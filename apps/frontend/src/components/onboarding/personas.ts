import type { AssistantPersona } from "@/lib/services/api/users/preferences.api";

export const PERSONA_OPTIONS: {
  value: AssistantPersona;
  label: string;
  description: string;
  image: string;
  imageAlt: string;
}[] = [
  {
    value: "cheerful",
    label: "Ceria",
    description:
      "Antusias, energik, dan optimistis; membuat tugas rutin terasa lebih ringan.",
    image: "/images/personas/haruka_cheerful.webp",
    imageAlt: "Sosok tersenyum lebar dengan energi positif.",
  },
  {
    value: "professional",
    label: "Profesional",
    description:
      "Terkendali, presisi, dan dapat diandalkan; jelas dan efisien tanpa berlebihan.",
    image: "/images/personas/haruka_professional.webp",
    imageAlt: "Asisten rapi menyusun berkas kerja dengan tenang.",
  },
  {
    value: "friendly",
    label: "Ramah",
    description:
      "Hangat, mudah diajak bicara, dan penuh perhatian; seperti mengobrol dengan seseorang yang Anda kenal.",
    image: "/images/personas/haruka_friendly.webp",
    imageAlt: "Dua sosok berbincang akrab dengan hangat.",
  },
  {
    value: "playful",
    label: "Jenaka",
    description:
      "Cerdas, santai, dan ekspresif; humor ringan yang tetap fokus pada tujuan Anda.",
    image: "/images/personas/haruka_playful.webp",
    imageAlt: "Sosok ceria melontarkan lelucon ringan.",
  },
];
