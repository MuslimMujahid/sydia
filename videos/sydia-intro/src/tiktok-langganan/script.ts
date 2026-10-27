// Dialogue for the TikTok "subscriptions" use case. Rina tells Sydia whenever she
// signs up for something; the morning briefing flags what renews or ends soon.
export const LANGGANAN_SCRIPT = [
  {
    id: "hook-rina",
    speaker: "rina",
    text: "Netflix, Spotify, ChatGPT, belum lagi trial ini, trial itu.",
  },
  {
    id: "boncos-rina",
    speaker: "rina",
    text: "Kalau lupa tanggalnya, tahu-tahu saldo kepotong. Boncos!",
  },
  {
    id: "log-rina",
    speaker: "rina",
    text: "Untung, tiap daftar langganan aku selalu bilang ke Sydia.",
  },
  {
    id: "brief-sydia",
    speaker: "sydia",
    text: "Selamat pagi, Rina. Trial Canva Pro habis besok, dan Netflix diperpanjang lusa. Mau lanjut atau berhenti?",
  },
  {
    id: "decide-rina",
    speaker: "rina",
    text: "Canva stop aja. Netflix lanjut.",
  },
  {
    id: "ok-sydia",
    speaker: "sydia",
    text: "Siap. Batalkan Canva hari ini, ya, biar nggak kepotong. Netflix tetap jalan.",
  },
  {
    id: "end-sydia",
    speaker: "sydia",
    text: "Biar saya yang ingat tanggalnya.",
  },
] as const;

export type LanggananLineId = (typeof LANGGANAN_SCRIPT)[number]["id"];
