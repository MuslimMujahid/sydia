// Dialogue for the TikTok "KTP and KK for a form" use case. Rina's form asks for
// photos of her KTP and KK; instead of digging through her gallery she asks Sydia,
// who sends both straight into the chat.
export const KTP_SCRIPT = [
  {
    id: "hook-rina",
    speaker: "rina",
    text: "Duh, formulirnya minta foto KTP sama KK.",
  },
  {
    id: "gallery-rina",
    speaker: "rina",
    text: "Galeri isinya ribuan foto. Nyarinya dari mana, coba?",
  },
  {
    id: "ingat-rina",
    speaker: "rina",
    text: "Eh, bentar. Kan udah aku simpan di Sydia!",
  },
  {
    id: "ask-rina",
    speaker: "rina",
    text: "Sydia, kirimin foto KTP sama KK aku, dong.",
  },
  {
    id: "reply-sydia",
    speaker: "sydia",
    text: "Ini KTP dan KK Anda. Langsung bisa diunggah ke formulirnya.",
  },
  {
    id: "upload-rina",
    speaker: "rina",
    text: "Tinggal unggah, beres! Nggak perlu bongkar galeri lagi.",
  },
  {
    id: "thanks-rina",
    speaker: "rina",
    text: "Makasih, Sydia! Formulirnya udah kekirim.",
  },
  {
    id: "thanks-sydia",
    speaker: "sydia",
    text: "Sama-sama, Rina. Akta kelahiran dan NPWP Anda juga saya simpan, kalau nanti dibutuhkan.",
  },
  {
    id: "end-sydia",
    speaker: "sydia",
    text: "Simpan sekali. Siap kapan pun Anda butuh.",
  },
] as const;

export type KtpLineId = (typeof KTP_SCRIPT)[number]["id"];
