// Dialogue for the "presentation" use case. Rina is the user; she says
// "aku" to Sydia, and Sydia answers with "Anda" as the product does.
export const USECASE_SCRIPT = [
  {
    id: "flash-rina",
    speaker: "rina",
    text: "Sydia, simpan grafik ini, ya. Penting buat presentasi klien nanti.",
  },
  {
    id: "flash-sydia",
    speaker: "sydia",
    text: "Siap, sudah saya simpan. Kapan pun butuh, tinggal tanya.",
  },
  {
    id: "today-rina",
    speaker: "rina",
    text: "Aduh, grafiknya belum masuk! Nama filenya apa, ya?",
  },
  {
    id: "ask-rina",
    speaker: "rina",
    text: "Sydia, grafik penjualan yang aku simpan bulan lalu, kirim sekarang, ya.",
  },
  {
    id: "ask-sydia",
    speaker: "sydia",
    text: "Ini grafiknya. Anda simpan tanggal dua puluh empat September, dari Mbak Sinta. Semangat presentasinya!",
  },
  {
    id: "thanks-rina",
    speaker: "rina",
    text: "Makasih, Sydia. Kamu penyelamat!",
  },
  {
    id: "thanks-sydia",
    speaker: "sydia",
    text: "Sama-sama. Saya siap membantu, kapan saja.",
  },
  {
    id: "end-sydia",
    speaker: "sydia",
    text: "Biar saya yang ingat.",
  },
] as const;

export type LineId = (typeof USECASE_SCRIPT)[number]["id"];
