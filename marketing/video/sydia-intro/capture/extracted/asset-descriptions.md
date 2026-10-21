# Asset inventory — Sydia intro

All screenshots are real captures of the local Sydia app (http://localhost:3000), signed in as the demo account,
1440×900 CSS px at 2× (files are 2880×1800). Dev-only overlay button hidden. Demo documents are fictional and were
uploaded to the local demo account for this video. App sidebar on the left (≈376px @2x wide... ≈261 css px), content right.

| File                                                           | What it shows                                                                                                                            | Good for                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| capture/assets/sydia-logo.svg                                  | Official Sydia logo — rounded triangular glossy badge, amber→pink→violet gradient with white upward chevron (1024×1024 viewBox)          | Brand reveal, end card, app icon moments           |
| capture/assets/hero-00-empty.png                               | Empty chat: "Ingin melakukan apa hari ini?" heading, centered pill composer "Tulis pesan atau lampirkan file..." at css (519,413) 674×34 | Hero demo opening; base plate for a typing overlay |
| capture/assets/hero-01-typed.png                               | Same, with the query typed in the composer and pink send button active                                                                   | Hero demo — query typed                            |
| capture/assets/hero-02-preparing.png                           | Query bubble top-right; spinner "Sydia sedang menyiapkan jawaban…"; composer note "Tunggu hingga Sydia menyelesaikan jawaban ini."       | Hero demo — thinking beat                          |
| capture/assets/hero-03-showing-file.png                        | Same layout, status "Sydia sedang menampilkan file…"                                                                                     | Hero demo — searching beat                         |
| capture/assets/hero-04-answer.png                              | Answer: purple doc chip "Kontrak Sewa Apartemen Cendana Residence.pdf", bold "Rp 13.000.000", "Sumber" list with page citations          | Hero demo payoff — zoom onto doc chip + deposit    |
| capture/assets/page-files-list.png                             | File page, list view: 6 PDFs with size, "Siap" status, date                                                                              | "Semua dokumenmu" / files beat                     |
| capture/assets/page-files-grid.png                             | File page, grid view with PDF thumbnail cards                                                                                            | Files beat (more visual)                           |
| capture/assets/chat-reminder.png                               | Chat: "Ingatkan aku bayar listrik tiap tanggal 25 jam 9 pagi ya" → amber "Bayar listrik" reminder chip, 25 Okt 2026 09.00 · bulanan      | Feature hit: reminders                             |
| capture/assets/chat-task.png                                   | Chat: task request → "Kirim draft materi kampanye ke tim — Tenggat 23 Okt 2026, 17.00"                                                   | Feature hit: tasks                                 |
| capture/assets/chat-event.png                                  | Chat: meeting request → green calendar chip "Meeting dengan Pak Budi — bahas kampanye Q4", 21 Okt 14.00–15.00                            | Feature hit: calendar                              |
| capture/assets/chat-note.png                                   | Chat: "Catat ya: ide kado ulang tahun Ibu…" → "Baik, sudah dicatat di catatan harian hari ini."                                          | Feature hit: notes/memory                          |
| capture/assets/page-reminders.png                              | Pengingat page: "Bayar listrik · 25 Okt 2026 · Berulang bulanan"                                                                         | Reminders proof                                    |
| capture/assets/page-tasks.png                                  | Tugas list: "Kirim draft materi kampanye ke tim", categories sidebar                                                                     | Tasks proof                                        |
| capture/assets/page-calendar-week.png                          | Week view 19–25 Okt 2026: purple "Meeting dengan…" block Wed 21 14.00, amber "Kirim draft materi…" Fri 23                                | Calendar proof (everything lands in one place)     |
| capture/assets/page-notes.png                                  | Catatan: daily note "Selasa, 20 Oktober" editor                                                                                          | Notes beat (secondary)                             |
| capture/assets/page-chat-home.png                              | Chat home with conversation list in sidebar                                                                                              | Generic app establishing shot                      |
| capture/assets/chats-1.png                                     | Side-by-side Web chat / Telegram / WhatsApp previews answering the same reminder request                                                 | "Di WhatsApp, Telegram, atau web" channels beat    |
| capture/assets/whatsapp.svg, telegram.svg, google-calendar.svg | Brand glyphs used inside the app's integrations UI                                                                                       | Channel icons (small, factual use only)            |

Key measured positions (css px in the 1440×900 viewport; ×2 for image px):

- Composer textarea: x 519, y 413, w 674, h 34; Inter 15px/24px, ink rgb(23,20,25) — capture/extracted/composer-geometry.json
- Hero answer article: x 496, y ~200 (after scroll) — capture/extracted/answer-geometry.json (doc chip, deposit bold)
