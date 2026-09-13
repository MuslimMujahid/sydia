import type { NotificationTemplateRegistry } from './notification-templates';

export const FOLLOW_UP_TEMPLATES = {
  professional: {
    en: [
      '⏰ {title}\nPlease review this {kind} when convenient.',
      '⏰ {title}\nThis {kind} is pending your attention.',
      '⏰ {title}\nPlease consider taking action or rescheduling this {kind}.',
      '⏰ {title}\nYou may resume this {kind} whenever you are ready.',
      '⏰ {title}\nThis {kind} is ready for its next step.',
    ],
    id: [
      '⏰ {title}\nSilakan tinjau {kind} ini jika Anda ada waktu.',
      '⏰ {title}\n{kind} ini masih membutuhkan perhatian Anda.',
      '⏰ {title}\nHarap selesaikan atau jadwalkan ulang {kind} ini.',
      '⏰ {title}\nAnda dapat melanjutkan {kind} ini kapan saja.',
      '⏰ {title}\n{kind} ini siap untuk langkah selanjutnya.',
    ],
  },
  friendly: {
    en: [
      '🌿 {title}\nWhenever you have a moment, take a look at this {kind}.',
      '🙂 {title}\nJust a quick reminder to check back on this {kind}.',
      '☕ {title}\nBusy day? This {kind} can wait until you take a breath.',
      '🌼 {title}\nWhenever you are ready, give this {kind} another glance.',
      '🤝 {title}\nHere to support you whenever you want to revisit this {kind}.',
    ],
    id: [
      '🌿 {title}\nJika ada waktu luang, yuk tengok kembali {kind} ini.',
      '🙂 {title}\nPengingat santai untuk mengecek kembali {kind} ini.',
      '☕ {title}\nHari ini padat? {kind} ini bisa menunggu sampai Anda leluasa.',
      '🌼 {title}\nSaat Anda siap, silakan lihat kembali {kind} ini.',
      '🤝 {title}\nSiap membantu kapan pun Anda ingin melanjutkan {kind} ini.',
    ],
  },
  cheerful: {
    en: [
      '✨ {title}\nA little push can get this {kind} done—you’ve got this!',
      '🌟 {title}\nReady to make some bright progress on this {kind}?',
      '🚀 {title}\nGot a spark of energy? Let’s tackle this {kind}!',
      '🎉 {title}\nOne small move will bring this {kind} to the finish line!',
      '☀️ {title}\nA fresh moment to knock out this {kind}!',
    ],
    id: [
      '✨ {title}\nSedikit dorongan lagi untuk menyelesaikan {kind} ini—semangat!',
      '🌟 {title}\nSiap buat kemajuan baru di {kind} ini hari ini?',
      '🚀 {title}\nMumpung lagi semangat, yuk selesaikan {kind} ini!',
      '🎉 {title}\nSatu langkah kecil lagi agar {kind} ini makin cepat selesai!',
      '☀️ {title}\nMomen pas buat menuntaskan {kind} ini!',
    ],
  },
  calm: {
    en: [
      '🌱 {title}\nTake your time. Return to this {kind} at your own pace.',
      '🌙 {title}\nWhenever it feels right, give this {kind} a moment of your time.',
      '🫧 {title}\nNo rush at all—this {kind} will be waiting here for you.',
      '🍃 {title}\nA quiet moment is all it takes to revisit this {kind}.',
      '🕊️ {title}\nTake the next step on this {kind} whenever you are at ease.',
    ],
    id: [
      '🌱 {title}\nSantai saja. Kembali ke {kind} ini sesuai ritme Anda.',
      '🌙 {title}\nSaat waktunya tepat, luangkan sebentar untuk {kind} ini.',
      '🫧 {title}\nTak perlu terburu-buru, {kind} ini tetap menunggu Anda.',
      '🍃 {title}\nCukup sejenak momen tenang untuk melanjutkan {kind} ini.',
      '🕊️ {title}\nLanjutkan {kind} ini kapan pun Anda merasa nyaman.',
    ],
  },
  playful: {
    en: [
      '🎈 {title}\nThis {kind} is patiently awaiting your magic touch!',
      '🪄 {title}\nA quick flick of progress will make this {kind} disappear in no time!',
      '🐾 {title}\nFollow the breadcrumbs back to this {kind} when you’re ready.',
      '🎲 {title}\nIt’s your turn! Your next move on this {kind} is waiting.',
      '🛼 {title}\nWhenever you’re ready to roll, jump back into this {kind}.',
    ],
    id: [
      '🎈 {title}\n{kind} ini setia menunggu sentuhan ajaib Anda!',
      '🪄 {title}\nSedikit trik dari Anda bisa bikin {kind} ini beres seketika!',
      '🐾 {title}\nYuk ikuti jejaknya kembali ke {kind} ini saat Anda siap!',
      '🎲 {title}\nGiliran Anda! Langkah selanjutnya untuk {kind} ini ada di tangan Anda.',
      '🛼 {title}\nKalau sudah siap meluncur lagi, yuk balik ke {kind} ini!',
    ],
  },
} as const satisfies NotificationTemplateRegistry;
