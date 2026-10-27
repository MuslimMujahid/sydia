// Dialogue for the TikTok "voice note reminder" use case. Rina is rushing out,
// records a voice note instead of typing, and Sydia keeps reminding until it's done.
export const PENGINGAT_SCRIPT = [
  {
    id: "hook-rina",
    speaker: "rina",
    text: "Duh, telat! Tangan penuh, nggak sempat ngetik.",
  },
  {
    id: "vn-rina",
    speaker: "rina",
    text: "Sydia, nanti jam tujuh malam ingetin aku beli obat buat Mama. Terus besok pagi transfer SPP Adik, ya.",
  },
  {
    id: "reply-sydia",
    speaker: "sydia",
    text: "Siap, dua-duanya sudah saya catat. Beli obat untuk Mama jam tujuh malam, dan transfer SPP Adik besok pagi.",
  },
  {
    id: "remind-sydia",
    speaker: "sydia",
    text: "Rina, waktunya beli obat untuk Mama.",
  },
  {
    id: "again-sydia",
    speaker: "sydia",
    text: "Belum sempat, ya? Saya ingatkan lagi. Obat Mama jangan sampai lupa.",
  },
  {
    id: "done-rina",
    speaker: "rina",
    text: "Udah beli! Makasih, Sydia.",
  },
  {
    id: "done-sydia",
    speaker: "sydia",
    text: "Sip, saya tandai selesai. Besok pagi saya ingatkan soal SPP.",
  },
  {
    id: "end-sydia",
    speaker: "sydia",
    text: "Cukup kirim voice note. Sisanya, biar saya yang urus.",
  },
] as const;

export type PengingatLineId = (typeof PENGINGAT_SCRIPT)[number]["id"];
