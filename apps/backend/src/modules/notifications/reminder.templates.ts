import type { NotificationTemplateRegistry } from './notification-templates';

export const REMINDER_TEMPLATES = {
  professional: {
    en: [
      '⏰ {title}\n🕒 Scheduled: {time}\n📝 {notes}',
      '⏰ {title}\n🕒 Planned for: {time}\n📝 Notes: {notes}',
      '⏰ {title}\n🕒 Due: {time}\n📝 Details: {notes}',
      '⏰ {title}\n🕒 Time: {time}\n📝 Additional info: {notes}',
      '⏰ {title}\n🕒 Appointment: {time}\n📝 Reference: {notes}',
    ],
    id: [
      '⏰ {title}\n🕒 Dijadwalkan: {time}\n📝 {notes}',
      '⏰ {title}\n🕒 Rencana waktu: {time}\n📝 Catatan: {notes}',
      '⏰ {title}\n🕒 Tenggat waktu: {time}\n📝 Rincian: {notes}',
      '⏰ {title}\n🕒 Waktu: {time}\n📝 Info tambahan: {notes}',
      '⏰ {title}\n🕒 Janji temu: {time}\n📝 Referensi: {notes}',
    ],
  },
  friendly: {
    en: [
      '🌼 {title} — just a friendly reminder\n🕒 Coming up: {time}\n📝 A note for you: {notes}',
      '🙂 {title} — keeping this on your radar\n🕒 Set for: {time}\n📝 You noted: {notes}',
      '☕ {title} — here when you need it\n🕒 Time: {time}\n📝 Your notes: {notes}',
      '🤝 {title} — just checking in\n🕒 Planned at: {time}\n📝 You mentioned: {notes}',
      '💛 {title} — a gentle reminder\n🕒 Scheduled for: {time}\n📝 Don’t forget: {notes}',
    ],
    id: [
      '🌼 {title} — sekadar pengingat santai\n🕒 Segera hadir: {time}\n📝 Catatan untuk Anda: {notes}',
      '🙂 {title} — agar tetap teringat\n🕒 Dijadwalkan: {time}\n📝 Catatan Anda: {notes}',
      '☕ {title} — siap saat Anda butuhkan\n🕒 Waktu: {time}\n📝 Catatan Anda: {notes}',
      '🤝 {title} — sekadar mengingatkan\n🕒 Direncanakan: {time}\n📝 Yang Anda catat: {notes}',
      '💛 {title} — Pengingat lembut untuk Anda\n🕒 Terjadwal: {time}\n📝 Jangan lupa: {notes}',
    ],
  },
  cheerful: {
    en: [
      '🎉 {title} — you’ve got this!\n🕒 Set for: {time}\n📝 Game plan: {notes}',
      '🌟 {title} — a bright little nudge!\n🕒 Coming up at: {time}\n📝 Handy notes: {notes}',
      '🚀 {title} — ready when you are!\n🕒 Launching at: {time}\n📝 Mission notes: {notes}',
      '🌈 {title} — something to look forward to!\n🕒 Happening at: {time}\n📝 Bright idea: {notes}',
      '✨ {title} — let’s make it happen!\n🕒 Planned for: {time}\n📝 Details: {notes}',
    ],
    id: [
      '🎉 {title} — Anda pasti bisa!\n🕒 Terjadwal: {time}\n📝 Rencana aksi: {notes}',
      '🌟 {title} — pengingat ceria untuk Anda!\n🕒 Waktunya: {time}\n📝 Catatan penting: {notes}',
      '🚀 {title} — siap saat Anda siap!\n🕒 Dimulai pada: {time}\n📝 Catatan misi: {notes}',
      '🌈 {title} — ada yang seru untuk dinantikan!\n🕒 Berlangsung: {time}\n📝 Ide seru Anda: {notes}',
      '✨ {title} — mari wujudkan!\n🕒 Direncanakan: {time}\n📝 Rinciannya: {notes}',
    ],
  },
  calm: {
    en: [
      '🌿 {title} — a quiet reminder\n🕒 Set for: {time}\n📝 In your words: {notes}',
      '🌙 {title} — keeping things steady\n🕒 Scheduled: {time}\n📝 Your reference: {notes}',
      '☁️ {title} — no rush, just a note\n🕒 Time: {time}\n📝 Your note: {notes}',
      '🪷 {title} — a moment to keep in mind\n🕒 Set for: {time}\n📝 Context: {notes}',
      '🍃 {title} — calmly waiting for you\n🕒 Time: {time}\n📝 Accompanying note: {notes}',
    ],
    id: [
      '🌿 {title} — pengingat tenang\n🕒 Waktu: {time}\n📝 Catatan Anda: {notes}',
      '🌙 {title} — menjaga semuanya tetap teratur\n🕒 Dijadwalkan: {time}\n📝 Referensi Anda: {notes}',
      '☁️ {title} — santai saja, sekadar catatan\n🕒 Berlangsung: {time}\n📝 Yang Anda catat: {notes}',
      '🪷 {title} — sesuatu untuk diingat\n🕒 Siap pada: {time}\n📝 Konteks: {notes}',
      '🍃 {title} — tersimpan rapi untuk Anda\n🕒 Waktu: {time}\n📝 Catatan pendamping: {notes}',
    ],
  },
  playful: {
    en: [
      '🎲 {title} — your future self says hi!\n🕒 Rendezvous time: {time}\n📝 Plot twist: {notes}',
      '🐾 {title} — this one is following you around!\n🕒 Popping up at: {time}\n📝 Secret clue: {notes}',
      '🪄 {title} — presto, a reminder!\n🕒 Magic time: {time}\n📝 Spell ingredients: {notes}',
      '🎈 {title} — floating back onto your radar!\n🕒 Landing at: {time}\n📝 The fine print: {notes}',
      '😄 {title} — your to-do list sent a postcard!\n🕒 Arriving at: {time}\n📝 Postcard message: {notes}',
    ],
    id: [
      '🎲 {title} — ada pesan dari Anda di masa depan!\n🕒 Jam tayang: {time}\n📝 Kejutan cerita: {notes}',
      '🐾 {title} — pengingat ini mengikuti Anda terus!\n🕒 Muncul pada: {time}\n📝 Petunjuk rahasia: {notes}',
      '🪄 {title} — simsalabim, pengingat datang!\n🕒 Jam keajaiban: {time}\n📝 Bahan mantra: {notes}',
      '🎈 {title} — melayang kembali ke radar Anda!\n🕒 Mendarat pada: {time}\n📝 Pesan tersembunyi: {notes}',
      '😄 {title} — daftar tugas Anda kirim kartu pos!\n🕒 Tiba pada: {time}\n📝 Isi kartu pos: {notes}',
    ],
  },
} as const satisfies NotificationTemplateRegistry;
