// Dialogue for the TikTok "deadline" use case. Rina logs her days in Sydia;
// when deadlines pile up, Sydia orders them by what is due first.
export const TIKTOK_SCRIPT = [
  {
    id: "hook-rina",
    speaker: "rina",
    text: "Deadline numpuk semua. Aku harus mulai dari mana, sih?",
  },
  {
    id: "log-rina",
    speaker: "rina",
    text: "Untungnya, tiap hari aku rajin catat semuanya di Sydia.",
  },
  {
    id: "ask-rina",
    speaker: "rina",
    text: "Sydia, urutin tugasku dari yang paling mepet, dong.",
  },
  {
    id: "list-sydia",
    speaker: "sydia",
    text: "Siap. Pertama, laporan bulanan untuk Bu Ratna, besok jam lima sore. Kedua, revisi logo klien, hari Kamis. Ketiga, slide rapat, hari Jumat.",
  },
  {
    id: "steps-sydia",
    speaker: "sydia",
    text: "Mulai dari laporan dulu, ya. Langkah pertama, kumpulkan data penjualan. Cukup tiga puluh menit.",
  },
  {
    id: "relief-rina",
    speaker: "rina",
    text: "Oke, sekarang jelas. Gas!",
  },
  {
    id: "end-sydia",
    speaker: "sydia",
    text: "Satu per satu, pasti beres.",
  },
] as const;

export type TiktokLineId = (typeof TIKTOK_SCRIPT)[number]["id"];
