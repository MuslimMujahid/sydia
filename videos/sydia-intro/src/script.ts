// Voiceover script, one line per scene. Numbers are spelled out so the
// voice reads them naturally; the visuals show the digits.
export const SCRIPT = [
  {
    id: "hook",
    text: "Janji dengan klien, tagihan listrik, dokumen dari kantor. Semuanya tercecer di chat, lalu terlupa.",
  },
  {
    id: "intro",
    text: "Kenalkan Sydia. Asisten pribadi yang selalu ingat, dan memastikan semuanya beres.",
  },
  {
    id: "chat",
    text: "Cukup kirim pesan lewat WhatsApp. Tulis saja seperti biasa.",
  },
  {
    id: "actions",
    text: "Sydia langsung mengubahnya jadi tugas, pengingat, dan jadwal di kalender. Otomatis.",
  },
  {
    id: "media",
    text: "Lagi sibuk? Kirim voice note, foto, atau dokumen. Sydia paham isinya.",
  },
  {
    id: "memory",
    text: "Lupa sesuatu? Tanya saja. Sydia ingat semua yang pernah Anda ceritakan.",
  },
  {
    id: "briefing",
    text: "Setiap pagi, rangkuman hari Anda sudah menunggu di WhatsApp.",
  },
  {
    id: "dashboard",
    text: "Mau lihat semuanya sekaligus? Buka dasbor web. Tugas, kalender, memori, dan file, rapi di satu tempat.",
  },
  {
    id: "cta",
    text: "Biar Sydia yang ingat. Coba gratis tujuh hari, tanpa kartu, tanpa pembayaran.",
  },
] as const;

export type SceneId = (typeof SCRIPT)[number]["id"];
