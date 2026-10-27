// Dialogue for the TikTok "Dita's birthday cake" use case. Rina is about to order a
// cake for her friend Dita, remembers Dita might have an allergy, and asks Sydia,
// who recalls the peanut allergy Rina mentioned months ago.
export const KUE_SCRIPT = [
  {
    id: "hook-rina",
    speaker: "rina",
    text: "Besok Dita ulang tahun. Aku mau pesan kue buat kejutan.",
  },
  {
    id: "ragu-rina",
    speaker: "rina",
    text: "Eh, tapi Dita ada alergi nggak, ya? Kayaknya pernah cerita.",
  },
  {
    id: "ask-rina",
    speaker: "rina",
    text: "Sydia, Dita alergi apa, ya? Mau pesan kue ulang tahun.",
  },
  {
    id: "reply-sydia",
    speaker: "sydia",
    text: "Dita alergi kacang. Anda cerita bulan Juli, waktu makan siang bareng. Pilih kue tanpa kacang, ya.",
  },
  {
    id: "pick-rina",
    speaker: "rina",
    text: "Hampir aja pesan brownies kacang! Ganti red velvet, deh.",
  },
  {
    id: "thanks-rina",
    speaker: "rina",
    text: "Makasih, Sydia! Kuenya udah dipesan.",
  },
  {
    id: "thanks-sydia",
    speaker: "sydia",
    text: "Sama-sama, Rina. Besok jam tujuh pagi, saya ingatkan untuk ucapkan selamat ke Dita.",
  },
  {
    id: "end-sydia",
    speaker: "sydia",
    text: "Hal kecil tentang orang tersayang, biar Sydia yang ingatkan.",
  },
] as const;

export type KueLineId = (typeof KUE_SCRIPT)[number]["id"];
