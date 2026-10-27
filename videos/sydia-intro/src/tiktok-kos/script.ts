// Dialogue for the TikTok "can I keep a cat in my kos?" use case. Rina finds a
// stray kitten outside her boarding house and does not remember what the
// contract says about pets. She asks Sydia, who reads the contract PDF she
// saved earlier and quotes the clause, then drafts a polite message she copies
// and sends to the landlady herself. Numbers are spelled out so the voice reads
// them naturally; the visuals show digits.
export const KOS_SCRIPT = [
  {
    id: "hook-rina",
    speaker: "rina",
    text: "Aku nemu anak kucing di depan kos. Boleh nggak, ya, dibawa masuk?",
  },
  {
    id: "ask-rina",
    speaker: "rina",
    text: "Sydia, di kontrak kos aku boleh bawa hewan nggak?",
  },
  {
    id: "reply-sydia",
    speaker: "sydia",
    text: "Pasal tujuh: hewan peliharaan boleh, asal izin pemilik kos dulu.",
  },
  {
    id: "draft-rina",
    speaker: "rina",
    text: "Buatin pesan buat Ibu Kos, dong.",
  },
  {
    id: "draft-sydia",
    speaker: "sydia",
    text: "Ini drafnya. Anda salin, lalu kirim sendiri.",
  },
  {
    id: "end-sydia",
    speaker: "sydia",
    text: "Kirim sekali, Sydia yang bantu ingatkan.",
  },
] as const;

export type KosLineId = (typeof KOS_SCRIPT)[number]["id"];
