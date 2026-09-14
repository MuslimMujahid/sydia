import type { PersonaTemplateRegistry } from './notification-templates';

export const FOLLOW_UP_TEMPLATES = {
  professional: {
    en: [
      '⏰ Tasks are overdue and waiting for your review.\n\n{items}\n\nTell me which one you want to start with.',
      '📋 Overdue tasks require your review.\n\n{items}\n\nSelect one task to begin.',
      '🗂️ These tasks are past due and need your attention.\n\n{items}\n\nChoose one to address first.',
      '📌 Tasks are overdue and pending review.\n\n{items}\n\nPick one task as your starting point.',
      '✅ The overdue task list is ready for your review.\n\n{items}\n\nWhich one would you like to start with?',
    ],
    id: [
      '⏰ Ada tugas yang sudah melewati waktunya dan menunggu peninjauan Anda.\n\n{items}\n\nSilakan pilih satu untuk Anda mulai.',
      '📋 Tugas-tugas yang telah melewati batas waktu memerlukan peninjauan Anda.\n\n{items}\n\nSilakan pilih satu tugas untuk dimulai.',
      '🗂️ Tugas-tugas ini sudah melewati waktunya dan memerlukan perhatian Anda.\n\n{items}\n\nPilih satu untuk Anda tangani terlebih dahulu.',
      '📌 Tugas-tugas telah melewati batas waktu dan menunggu peninjauan Anda.\n\n{items}\n\nSilakan pilih satu tugas sebagai langkah awal.',
      '✅ Daftar tugas yang telah melewati batas waktu siap Anda tinjau.\n\n{items}\n\nTugas mana yang ingin Anda mulai?',
    ],
  },
  friendly: {
    en: [
      '🌿 Tasks are overdue and could use your review.\n\n{items}\n\nWhich one feels like a good place to start?',
      '💛 Tasks have slipped past due and are waiting for your attention.\n\n{items}\n\nPick one to get started when you’re ready.',
      '☕ These tasks are overdue and ready for a quick look from you.\n\n{items}\n\nChoose one that you’d like to start with.',
      '🌼 Tasks are past due and could use a little attention.\n\n{items}\n\nWhich one would you like to pick first?',
      '🤝 Your overdue tasks are here whenever you’re ready to review them.\n\n{items}\n\nSelect one to start at your own pace.',
    ],
    id: [
      '🌿 Tugas-tugas telah melewati waktunya dan dapat Anda tinjau.\n\n{items}\n\nTugas mana yang terasa tepat untuk Anda mulai?',
      '💛 Tugas-tugas telah melewati batas waktu dan menunggu perhatian Anda.\n\n{items}\n\nSilakan pilih satu untuk Anda mulai saat siap.',
      '☕ Tugas-tugas ini telah melewati waktunya dan siap Anda tinjau sebentar.\n\n{items}\n\nPilih satu yang ingin Anda mulai.',
      '🌼 Tugas-tugas telah melewati waktunya dan memerlukan sedikit perhatian.\n\n{items}\n\nTugas mana yang ingin Anda pilih terlebih dahulu?',
      '🤝 Tugas-tugas Anda yang telah melewati batas waktu siap Anda tinjau kapan pun Anda siap.\n\n{items}\n\nSilakan pilih satu untuk Anda mulai sesuai keinginan.',
    ],
  },
  cheerful: {
    en: [
      '🎉 Tasks have passed their due dates and are ready for your review—let’s get moving!\n\n{items}\n\nPick one to start with.',
      '🌟 Overdue tasks are calling for your review!\n\n{items}\n\nChoose one and make it your first step.',
      '🚀 Tasks are past due and waiting for your attention.\n\n{items}\n\nWhich one will you start with?',
      '🌈 Your overdue tasks are lined up for a review.\n\n{items}\n\nSelect one to get started.',
      '✨ These tasks are overdue and ready for a fresh look!\n\n{items}\n\nPick one to begin.',
    ],
    id: [
      '🎉 Tugas-tugas telah melewati waktunya dan siap Anda tinjau—mari kita mulai!\n\n{items}\n\nPilih satu untuk Anda mulai.',
      '🌟 Tugas-tugas yang telah melewati batas waktu menanti peninjauan Anda!\n\n{items}\n\nPilih satu sebagai langkah pertama Anda.',
      '🚀 Tugas-tugas telah melewati waktunya dan menunggu perhatian Anda.\n\n{items}\n\nTugas mana yang akan Anda mulai?',
      '🌈 Tugas-tugas Anda yang telah melewati batas waktu siap untuk ditinjau.\n\n{items}\n\nSilakan pilih satu untuk Anda mulai.',
      '✨ Tugas-tugas ini telah melewati waktunya dan siap Anda tinjau kembali!\n\n{items}\n\nPilih satu untuk Anda mulai.',
    ],
  },
  playful: {
    en: [
      '🎲 Tasks have overshot their due dates and are waiting for your review.\n\n{items}\n\nWhich one gets the first move?',
      '🪄 Overdue tasks are lined up for a little review magic.\n\n{items}\n\nPick one to start with.',
      '🐾 These tasks wandered past due and need your attention.\n\n{items}\n\nChoose one trail to follow first.',
      '🎈 Your overdue tasks are waving for a review.\n\n{items}\n\nWhich one shall you start with?',
      '😄 Tasks are past due and waiting in the wings.\n\n{items}\n\nPick one for your opening move.',
    ],
    id: [
      '🎲 Tugas-tugas telah melewati batas waktunya dan menunggu peninjauan Anda.\n\n{items}\n\nTugas mana yang menjadi langkah pertama Anda?',
      '🪄 Tugas-tugas yang telah melewati batas waktu sudah siap untuk sedikit keajaiban peninjauan Anda.\n\n{items}\n\nPilih satu untuk Anda mulai.',
      '🐾 Tugas-tugas ini telah berjalan melewati waktunya dan memerlukan perhatian Anda.\n\n{items}\n\nPilih satu jejak untuk Anda ikuti terlebih dahulu.',
      '🎈 Tugas-tugas Anda yang telah melewati batas waktu sedang menunggu peninjauan Anda.\n\n{items}\n\nTugas mana yang ingin Anda mulai?',
      '😄 Tugas-tugas telah melewati batas waktu dan sedang menunggu perhatian Anda.\n\n{items}\n\nPilih satu sebagai langkah pembuka Anda.',
    ],
  },
} as const satisfies PersonaTemplateRegistry;
