// Dialogue for the TikTok "call dadakan" use case. A client suddenly asks for
// a call; Rina asks Sydia to schedule a Google Meet. Sydia finds Pak Budi's
// email from his saved contact, sends the Google invite, reports the Meet link
// as still being created, then pushes a follow-up once the link is ready.
// Numbers are spelled out so the voice reads them naturally; the visuals show
// digits.
export const MEET_SCRIPT = [
  {
    id: "hook-rina",
    speaker: "rina",
    text: "Pak Budi tiba-tiba minta call jam dua. Mepet banget, link Meet belum ada!",
  },
  {
    id: "ask-rina",
    speaker: "rina",
    text: "Sydia, jadwalin Meet sama Pak Budi jam dua, ya.",
  },
  {
    id: "reply-sydia",
    speaker: "sydia",
    text: "Siap. Undangan sudah saya kirim ke email Pak Budi. Link Meet-nya sedang dibuat.",
  },
  {
    id: "ready-sydia",
    speaker: "sydia",
    text: "Link Google Meet sudah siap. Pak Budi juga sudah dapat undangannya.",
  },
  {
    id: "thanks-rina",
    speaker: "rina",
    text: "Okedeh, aku tinggal gabung aja.",
  },
  {
    id: "end-sydia",
    speaker: "sydia",
    text: "Call dadakan, Sydia yang siapkan.",
  },
] as const;

export type MeetLineId = (typeof MEET_SCRIPT)[number]["id"];
