// Dialogue for the TikTok "when was the last oil change" use case. At the
// workshop the mechanic asks Rina when she last changed her oil and she blanks.
// She asks Sydia, who reads it back from the daily note Rina wrote in August,
// then sets a reminder for the next change. Numbers are spelled out so the
// voice reads them naturally; the visuals show digits.
export const OLI_SCRIPT = [
  {
    id: "hook-rina",
    speaker: "rina",
    text: "Montirnya nanya, terakhir ganti oli kapan? Aku lupa.",
  },
  {
    id: "ask-rina",
    speaker: "rina",
    text: "Sydia, terakhir aku ganti oli kapan?",
  },
  {
    id: "reply-sydia",
    speaker: "sydia",
    text: "Dua puluh tujuh Agustus, hari Kamis, tepat dua bulan yang lalu.",
  },
  {
    id: "minta-rina",
    speaker: "rina",
    text: "Udah lama. Ingetin aku ganti oli lagi, ya.",
  },
  {
    id: "ingat-sydia",
    speaker: "sydia",
    text: "Siap. Dua bulan lagi, dua puluh tujuh Desember, saya ingatkan.",
  },
  {
    id: "end-sydia",
    speaker: "sydia",
    text: "Catat sekali, sisanya saya yang ingat.",
  },
] as const;

export type OliLineId = (typeof OLI_SCRIPT)[number]["id"];
