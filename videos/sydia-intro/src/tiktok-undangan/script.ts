// Dialogue for the TikTok "wedding invitation becomes a schedule" use case.
// Rina's wedding invitations pile up and she loses track of the dates, so she
// photographs Sarah's invitation and sends it to Sydia. Sydia reads the photo,
// saves the event to her calendar, and sets a reminder three days before so she
// still has time to buy a gift. Numbers are spelled out so the voice reads them
// naturally; the visuals show digits.
export const UNDANGAN_SCRIPT = [
  {
    id: "hook-rina",
    speaker: "rina",
    text: "Undangan nikahan Sarah numpuk sama undangan lain. Tanggalnya kapan, ya?",
  },
  {
    id: "send-rina",
    speaker: "rina",
    text: "Aku foto undangannya aja ahh, kirim ke Sydia.",
  },
  {
    id: "reply-sydia",
    speaker: "sydia",
    text: "Sarah dan Bagas, Sabtu tujuh November, jam sebelas siang, di Graha Cakrawala.",
  },
  {
    id: "gift-sydia",
    speaker: "sydia",
    text: "Sudah masuk kalender Anda. Tiga hari sebelumnya saya ingatkan beli kado.",
  },
  {
    id: "thanks-rina",
    speaker: "rina",
    text: "Okedeh, kalau dengan Sydia pasti aman.",
  },
  {
    id: "end-sydia",
    speaker: "sydia",
    text: "Foto sekali, jadwal, undangan semua beres.",
  },
] as const;

export type UndanganLineId = (typeof UNDANGAN_SCRIPT)[number]["id"];
