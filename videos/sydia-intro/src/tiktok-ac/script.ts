// Dialogue for the TikTok "tukang AC langganan" use case. Rina's air
// conditioner is dripping and the room is stifling, but she cannot remember the
// name or the number of the technician who fixed it last time. She asks Sydia,
// who finds the contact she saved in March under the alias "Tukang AC" and
// sends the card. Rina taps the number and calls Pak Joko herself; Sydia never
// calls anyone. Numbers are spelled out so the voice reads them naturally; the
// visuals show digits.
export const AC_SCRIPT = [
  {
    id: "hook-rina",
    speaker: "rina",
    text: "AC-nya netes, panas banget. Tukang yang kemarin, aku lupa namanya.",
  },
  {
    id: "ask-rina",
    speaker: "rina",
    text: "Sydia, nomor tukang AC yang kemarin siapa?",
  },
  {
    id: "reply-sydia",
    speaker: "sydia",
    text: "Pak Joko, tukang AC. Terakhir datang bulan Maret. Nomornya saya kirim.",
  },
  {
    id: "call-rina",
    speaker: "rina",
    text: "Nah, ini dia. Aku telepon sekarang.",
  },
  {
    id: "end-sydia",
    speaker: "sydia",
    text: "Sydia, asisten pribadimu.",
  },
] as const;

export type AcLineId = (typeof AC_SCRIPT)[number]["id"];
