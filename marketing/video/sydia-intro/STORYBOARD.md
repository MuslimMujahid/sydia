---
format: 1920x1080
duration: 136s
message: "Sydia — asisten AI pribadimu: cukup ceritakan, Sydia bantu ingat, rencanakan, dan atur."
arc: Problem → Introducing Sydia → Conversation to action → Remembers → Knowledge organized → Proactive → Messaging → All features → Closing
audience: Everyday Indonesian users who live in WhatsApp
mode: collaborative
language: id
music: upbeat energetic modern pop electronic, bright and positive, driving beat around 120 BPM, punchy drop, no vocals
source: pv-storyboard/storyboard.md (user-authored PV storyboard, v2) · VO recorded by the user (assets/pv/scene_N.mp3)
---

# Sydia — PV v2 (user storyboard) · 16:9 · 2:16

Scene durations are whole music bars (117.5 BPM: beat 0.522s, bar 2.0875s). Each scene's VO starts 0.5s into the scene. All times below are **scene-local seconds**; VO word times come from the real recordings. "On-screen" lines are the user's exact copy.

## Video direction

- **Look:** `frame.md` (Sydia Aurora) + `assets/sydia.css`. Bone canvas `#fbf8f5` with 2–3 soft aurora blooms + grain on every scene; Inter only; pink `#ef5a8a` for rings/caret/eyebrows; aurora gradient only on the logo moment, key words (`.sy-caption em`), stamps and the CTA.
- **Scene caption:** the storyboard's on-screen line uses `.sy-caption` (top band, y≈34–100, 54px Inter 800, one key word wrapped in `<em>` for the gradient). It reveals per-word on its cue and then holds for the rest of the scene.
- **App window:** real screenshots (2880×1800 = 1440×900 CSS @2×) sit in a `.sy-window` at **left 344, top 130, 1232×770** under a caption (scale: 1 CSS px of the app = 0.8556 window px). Camera moves = transform on ONE inner `.cam` wrapper (`transformOrigin: "0 0"`, `force3D: false`), never on the images. Screen swaps inside a window are quick crossfades (0.2–0.3s) of stacked `<img>` layers in the same cam. Click targets get a pink ring (`border 2.5px #ef5a8a` + soft halo) and, for clicks, a small white cursor-dot ripple — never a real OS cursor.
- **Typed requests:** typing is shown in the rebuilt big composer `.sy-composer` (centered, ~1180 wide, 34px text, pink caret, aurora send button), seek-safe typewriter (text = pure function of timeline time), then a send-press (scale 1→0.9→1) on a beat and a fast cut into the real app screenshot that shows the sent bubble. The text typed must match the real message exactly (given per scene).
- **Motion grammar:** smooth `power3.out` / `expo.out`; no bounce/back eases; reveals land on the VO word or the music beat given; entrances via `fromTo`; no exits except scene 9's final fade; holds stay still.
- **Keep-out:** nothing important below y=900.
- **Negative list:** no real cursor/browser chrome, no emoji, no `<br>` in copy, no CSS transitions/keyframes, no random/clock, no breathing loops.

---

## Frame 1 — Terlalu banyak yang harus diingat

- scene: A rapid montage piles up — unfinished tasks, calendar notifications, scattered notes, chat messages, forgotten info — until the screen is overwhelming; "Terlalu banyak yang harus diingat?" lands over the blurred clutter.
- voiceover: "Setiap hari, ada banyak hal yang perlu kita ingat. Jadwal, tugas, ide, dan informasi penting. Semuanya tersebar di berbagai tempat."
- duration: 12.042s
- transition_in: cut
- status: animated
- src: compositions/pv/01-problem.html
- type: hook
- blueprint: overwhelm-surround
- asset_candidates: assets/whatsapp.svg — WhatsApp glyph for a chat fragment

Start from the v1 frame `compositions/frames/01-scattered.html` (same look: WhatsApp card, email card with PDF chip, calendar card, sticky note, voice-note pill, file chips) and extend it. Copy for fragments (real demo data): chat "Jangan lupa review proposal Aurora ya" (WhatsApp · Nadia), calendar card "Review proposal Aurora · Kam 10.00", task card "Finalisasi proposal Aurora · Jumat" (unchecked checkbox), sticky note "Ide: loyalty program?", file chip "Proyek-Aurora-Brief.pdf", reminder toast "Pengingat · 08.00", notification toasts.

- beats_local: downbeats 1.60 · 3.69 · 5.78 · 7.87 · 9.95 (beat 0.522; the first 3.69s is the music intro)

Scene 1 (0.0–3.6s): slow steady zoom-out of the stage (1.06→1.0 over 0–8s). WhatsApp chat card pops on "Setiap" 0.60; a notification toast slides in from the top-right on 1.60; file chip on "ingat" 3.04.
Scene 2 (3.6–7.9s): one fragment per listed word: calendar card slides in on "Jadwal" 3.89 · task card on "tugas" 4.90 · sticky note slaps on "ide" 5.58 · email card with PDF chip on "informasi penting" 6.37 · reminder toast 7.26.
Scene 3 (7.9–9.9s): on "tersebar" 8.27–8.60 the montage accelerates — 4–6 more small toasts/chips (duplicates of the same items, smaller, partly off-edge) pop in quickly on 16th notes until the frame is overwhelming; everything picks up a slight blur.
Scene 4 (9.95–12.04s): on the downbeat 9.95 the clutter dims to 0.55 opacity + 3px blur and the caption "Terlalu banyak yang harus <em>diingat?</em>" builds word-by-word in the center (big, 84px, not the top band) — hold.

- sfx_plan: pop@0.60 · notification@1.60 · pop@3.04 · whoosh-short@3.89 · pop@4.90 · click-soft@5.58 · whoosh-short@6.37 · notification@7.26 · pop@8.27 · pop@8.40 · pop@8.53 · pop@8.66 · whoosh@9.80 · impact-bass-1@9.95

## Frame 2 — Kenalkan, Sydia

- scene: The clutter disappears; the Sydia logo is revealed over a soft warm gradient with "Sydia — Asisten AI Pribadimu", then it transitions into the main chat interface.
- voiceover: "Kenalkan, Sydia. Asisten AI pribadi yang membantu kamu mengingat, merencanakan, dan mengatur aktivitas sehari-hari."
- duration: 10.438s
- transition_in: zoom-through
- status: animated
- src: compositions/pv/02-intro.html
- type: product_intro
- blueprint: compose
- asset_candidates: assets/sydia-logo.svg — official logo; assets/pv-cap/s3-00-empty.png — real empty Sydia chat ("Ingin melakukan apa hari ini?")
- beats_local: downbeats 0.00 · 2.09 · 4.17 · 6.26 · 8.35

Scene 1 (0.0–1.6s): warm aurora blooms swell (bone ground, amber/coral/violet blooms large and soft); the logo (220px) lands center on "Kenalkan" 0.63 (scale 0.6→1, blur→0).
Scene 2 (1.6–4.2s): wordmark "Sydia" (180px Inter 800) slides out beside the logo on "Sydia" 1.41–1.64; the subtitle "Asisten AI Pribadimu" (52px, muted, "AI Pribadimu" in `<em>`) reveals per-word on 2.12.
Scene 3 (4.2–8.3s): three pill tags pop under the subtitle on their words: "Mengingat" 4.39 · "Merencanakan" 5.31 · "Mengatur" 6.14 (white pills, pink dot).
Scene 4 (8.35–10.44s): on the downbeat the lockup shrinks and rises out (scale 0.55, y −260, fade) while the real empty chat window (assets/pv-cap/s3-00-empty.png, standard window geometry) rises from below into its slot — we are now inside Sydia. Hold.

- sfx_plan: sparkle@0.00 · chime@0.63 · whoosh-short@1.41 · pop@4.39 · pop@5.31 · pop@6.14 · whoosh@8.35

## Frame 3 — Dari percakapan jadi aksi

- scene: User types one message in Sydia; Sydia confirms the task, calendar event and reminder; the task reference opens; then Tasks, Calendar and Reminders show the results.
- voiceover: "Dengan Sydia, mengatur aktivitas bisa sesederhana mengirim pesan. Cukup ceritakan apa yang perlu kamu lakukan. Sydia membantu mengubahnya menjadi tugas, jadwal, dan pengingat yang tersimpan dan bisa kamu kelola kapan saja."
- duration: 25.05s
- transition_in: cut
- status: animated
- src: compositions/pv/03-action.html
- type: feature_showcase
- blueprint: compose
- asset_candidates: assets/pv-cap/s3-00-empty.png — empty chat; assets/pv-cap/s3-run-08.png — sent bubble + "Sydia sedang menyiapkan jawaban…"; assets/pv-cap/s3-09-answer.png — answer with task chip, event line, reminder line; assets/pv-cap/s3-10-task-popover.png — task popover (Finalisasi proposal Aurora · Tandai selesai · Lihat tugas); assets/pv-cap/s3-11-tasks.png — task list; assets/pv-cap/s3-12-calendar-week.png — week view with "Review proposal…" Kam 22 10.00–11.00; assets/pv-cap/s3-13-reminders.png — reminders list "Review proposal Aurora dengan Nadia · 22 Okt 2026, 08.00"
- geometry (CSS px in the 1440×900 app; ×0.8556 for window px): answer task chip ≈ x 176–245… read exact boxes from capture-app/pv/s3/09-answer.boxes.json (button "Finalisasi proposal Aurora"); task list row "Finalisasi proposal Aurora" ≈ y 67 (capture-app/pv/s3c/11-tasks.boxes.json); calendar block "Review proposal…" ≈ x 810–955, y 465–510 (from the screenshot: KAM column, 10.00 row); reminder row ≈ y 255–300.
- typed text (exact): "Sydia, buat tugas finalisasi proposal Aurora sebelum Jumat. Jadwalkan juga review dengan Nadia hari Kamis jam 10, dan ingatkan aku jam 8 pagi."
- beats_local: downbeats 2.09 · 4.17 · 6.26 · 8.35 · 10.44 · 12.52 · 14.61 · 16.70 · 18.79 · 20.87 · 22.96

Scene 1 (0.0–4.8s): bone stage; the big composer `.sy-composer` (centered, top ~470) types the full request from 0.4 to 3.95 at an even pace (3 lines), pink caret; send press on the downbeat 4.17.
Scene 2 (4.2–8.3s): cut to the app window showing assets/pv-cap/s3-run-08.png (sent bubble + "Sydia sedang menyiapkan jawaban…"); caption "Cukup ceritakan. Sydia bantu <em>atur.</em>" reveals per-word from "Cukup" 4.81 and holds for the rest of the scene.
Scene 3 (8.35–13.6s): the answer (s3-09-answer) crossfades in on 8.35; cam pushes to the answer column (scale ~1.45 on the answer block); rings draw on the words: task chip on "tugas" 10.86 · event line on "jadwal" 11.48 · reminder line on "pengingat" 12.78; three small labelled badges ("Tugas", "Jadwal", "Pengingat") stack at the window's right edge as each ring lands.
Scene 4 (13.6–14.6s): cursor-dot click ripple on the task chip at 13.60 and the task popover (s3-10-task-popover) crossfades in.
Scene 5 (14.61–18.7s): on the downbeat swap to the task list (s3-11-tasks), cam framed on the list; ring "Finalisasi proposal Aurora" at 15.0.
Scene 6 (18.79–22.9s): swap to the week calendar (s3-12-calendar-week); cam zooms toward the purple "Review proposal…" block (Kam 22, 10.00) and rings it at 19.3.
Scene 7 (22.96–25.05s): swap to Reminders (s3-13-reminders); ring the "Review proposal Aurora dengan Nadia · 22 Okt 2026, 08.00" row at 23.2; hold.

- sfx_plan: typing@0.40 · typing@1.90 · key-press@3.90 · click@4.17 · whoosh-short@4.25 · sparkle@8.35 · ping@10.86 · ping@11.48 · ping@12.78 · click@13.60 · whoosh-short@14.61 · pop@15.00 · whoosh-short@18.79 · ping@19.30 · whoosh-short@22.96 · ping@23.20

## Frame 4 — Asisten yang mengingat

- scene: In a new conversation the user asks about Nadia's design preference; Sydia retrieves the previously saved context and answers; the relevant info is highlighted.
- voiceover: "Nggak perlu lagi mengulang informasi yang sama. Sydia bisa mengingat informasi penting dari percakapan sebelumnya, sehingga semakin mudah membantumu dengan konteks yang relevan."
- duration: 16.70s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/pv/04-remembers.html
- type: feature_showcase
- blueprint: compose
- asset_candidates: assets/pv-cap/s4-00-empty.png — new empty chat; assets/pv-cap/s4-run-10.png — sent question + thinking; assets/pv-cap/s4-09-answer.png — answer: "Preferensi desain Nadia untuk Proyek Aurora tercatat di catatan harian hari ini, Rabu 21 Oktober 2026:" + bullets "Minimal", "Warna netral: krem, abu hangat", "Hindari gradien yang ramai"
- important: the answer screenshot has an extra line under the bullets about memory search being unavailable (a local-environment quirk). **Never show it**: frame the cam so the window bottom edge cuts above it (the bullets end ≈ y 305 CSS; the extra line starts ≈ y 330 CSS) or cover it with a bone-white patch inside the cam.
- typed text (exact): "Sydia, apa preferensi desain Nadia yang pernah kita bahas?"
- beats_local: downbeats 0.00 · 2.09 · 4.18 · 6.26 · 8.35 · 10.44 · 12.53 · 14.61

Scene 1 (0.0–2.1s): a "Chat baru" moment: the empty chat window (s4-00-empty) is in place; the big composer types the question 0.3–1.9; send press on 2.09.
Scene 2 (2.1–4.2s): cut to s4-run-10 (question bubble + thinking); caption "Bukan cuma menjawab. Sydia juga <em>mengingat.</em>" reveals from "Sydia" 3.44 and holds.
Scene 3 (4.18–8.3s): on the downbeat the answer (s4-09-answer) crossfades in; cam pushes onto the answer (scale ~1.6, framing question bubble + answer + bullets only); marker sweeps (soft pink highlight behind text) land on the three bullets one by one at 6.26 · 6.78 · 7.30.
Scene 4 (8.35–16.7s): a small source tag card "Dari catatan harian · Rabu, 21 Okt" pops next to the answer at 8.35 with a dashed connector to the first line; hold still to the end.

- sfx_plan: typing@0.30 · click@2.09 · whoosh-short@2.15 · sparkle@4.18 · click-soft@6.26 · click-soft@6.78 · click-soft@7.30 · pop@8.35

## Frame 5 — Dokumen, catatan, informasi

- scene: User asks Sydia to find the Proyek Aurora document; Sydia finds Proyek-Aurora-Brief.pdf; the user asks for a summary as a note; Sydia summarizes and creates "Rangkuman Proyek Aurora"; the note reference opens its side editor; "Buka di Catatan" opens the Notes workspace; a short pan over the File workspace shows the stored brief.
- voiceover: "Punya dokumen panjang, ide mendadak, atau informasi yang ingin disimpan? Sydia membantu memahami dokumen, merangkum informasi, dan mengubahnya menjadi catatan yang bisa kamu akses kembali. Semua tersimpan dalam ruang kerja yang rapi dan terorganisir."
- duration: 29.225s
- transition_in: crossfade
- status: animated
- src: compositions/pv/05-knowledge.html
- type: feature_showcase
- blueprint: compose
- asset_candidates: assets/pv-cap/s5-run-15.png — "Sydia, cari dokumen tentang Proyek Aurora." sent + working; assets/pv-cap/s5-09-answer.png — answer with Sumber chip "Proyek-Aurora-Brief.pdf · halaman 1"; assets/pv-cap/s5-20-run-20.png — second message sent + working; assets/pv-cap/s5-20-answer.png — summary + "Catatan [Rangkuman Proyek Aurora] sudah dibuat" chip (scrolled view); assets/pv-cap/s5-30-note-drawer.png — conversation left + note editor drawer right with "Buka di Catatan" button; assets/pv-cap/s5-31-notes-workspace.png — Notes workspace with the note open; assets/pv-cap/s5-33-files.png — File list incl. "Proyek-Aurora-Brief.pdf"
- geometry: read exact boxes from capture-app/pv/s5b/*.boxes.json (Sumber chip in 09-answer; note chip "Rangkuman Proyek Aurora" in 20-answer; "Buka di Catatan" button in 30-note-drawer).
- note: some bullet lists in these live answers render empty ("Sasaran:" / "Kebutuhan utama:" with nothing under them) — keep the cam off those empty lines; frame on the summary paragraph, "Arah desain" line, the note chip and the Sumber chip.
- typed text 1 (exact): "Sydia, cari dokumen tentang Proyek Aurora."
- typed text 2 (exact): "Sydia, rangkum kebutuhan utama dari brief proyek Aurora, lalu buatkan catatan baru berjudul Rangkuman Proyek Aurora berisi poin-poin pentingnya."
- beats_local: downbeats 2.09 · 4.17 · 6.26 · 8.35 · 10.44 · 12.52 · 14.61 · 16.70 · 18.79 · 20.87 · 22.96 · 25.05 · 27.14

Scene 1 (0.0–2.1s): big composer types typed text 1 (0.2–1.6); send press on 2.09. The caption builds progressively across the scene: "<em>Dokumen.</em>" on "dokumen" 0.96.
Scene 2 (2.1–4.1s): cut to s5-run-15 then on 2.6 crossfade to s5-09-answer; cam onto the Sumber section; ring the "Proyek-Aurora-Brief.pdf" chip at 3.13 and a "Ketemu" stamp (`.sy-stamp`) pops beside it at 3.40.
Scene 3 (4.17–8.3s): the big composer returns (window dims behind it) and types typed text 2 (4.3–7.6, 3 lines); send press on 8.35.
Scene 4 (8.35–12.5s): cut to s5-20-run-20 briefly, then on 9.0 crossfade to s5-20-answer; cam on the summary paragraph + note line; ring the "Rangkuman Proyek Aurora" note chip on "catatan" 11.51; caption grows: "Dokumen. <em>Catatan.</em>" at 11.51.
Scene 5 (12.52–16.6s): cursor-dot click on the note chip at 12.52 → s5-30-note-drawer crossfades in (drawer on the right with the note); caption grows: "Dokumen. Catatan. <em>Informasi.</em>" at 13.23; ring + click "Buka di Catatan" at 15.2.
Scene 6 (16.70–22.9s): swap to the Notes workspace (s5-31-notes-workspace); cam does one slow left→right glide from the left panel (daily notes / folders) to the open note; caption completes "Dokumen. Catatan. Informasi. <em>Saling terhubung.</em>" at 17.0.
Scene 7 (22.96–29.2s): swap to the File workspace (s5-33-files); short pan down the list and ring the "Proyek-Aurora-Brief.pdf" row at 24.0; hold.

- sfx_plan: typing@0.20 · click@2.09 · whoosh-short@2.15 · sparkle@2.60 · ping@3.13 · pop@3.40 · typing@4.30 · typing@5.80 · click@8.35 · whoosh-short@8.40 · sparkle@9.00 · ping@11.51 · click@12.52 · whoosh-short@12.60 · click@15.20 · whoosh@16.70 · whoosh-short@22.96 · ping@24.00

## Frame 6 — Mulai hari dengan lebih terarah

- scene: Next morning: a daily briefing with the Aurora review and its reminder; the Today agenda in Sydia; then the Aurora task gets completed.
- voiceover: "Mulai harimu dengan Sydia. Dengan morning-brief dan pengingat, Sydia membantumu tetap on-track."
- duration: 10.438s
- transition_in: zoom-through
- status: animated
- src: compositions/pv/06-proactive.html
- type: benefit_highlight
- blueprint: compose
- asset_candidates: assets/pv-cap/s6-40-day-kamis.png — Calendar day view "Kamis, 22 Oktober 2026" with "Review proposal Aurora dengan Nadia 10.00–11.00"; assets/pv-cap/s6-41-tasks-before.png — task list with "Finalisasi proposal Aurora" open; assets/pv-cap/s6-43-tasks-after.png — "Finalisasi proposal Aurora" checked under "Selesai"; assets/whatsapp.svg; assets/sydia-logo.svg
- briefing message (rebuilt WhatsApp-style chat bubble from Sydia — Sydia's own briefing format: one intro sentence + sections; the data is the account's real data for Kamis 22 Okt):
  "Selamat pagi! Hari ini fokus ke review proposal Aurora bersama Nadia." · section "Agenda (1)" → "• Review proposal Aurora dengan Nadia — 10.00–11.00" · section "Pengingat hari ini (1)" → "• Review proposal Aurora dengan Nadia — 08.00"
- beats_local: downbeats 0.00 · 2.09 · 4.18 · 6.26 · 8.35

Scene 1 (0.0–1.6s): a warm "morning" card: big time "07.00" + "Kamis, 22 Oktober" with a soft sunrise bloom (amber), the caption "Mulai hari dengan lebih <em>terarah.</em>" reveals from 0.61.
Scene 2 (1.6–4.2s): a phone mockup (WhatsApp-style chat with "Sydia" header + logo avatar) slides in at left; the briefing bubble pops on "morning brief" 3.00, its two sections reveal at 3.45 and 3.98 ("pengingat").
Scene 3 (4.18–6.2s): the Calendar day view window (s6-40-day-kamis) slides in at right (smaller window, ~1040 wide) on the downbeat; ring the 10.00 review block at 4.74.
Scene 4 (6.26–10.44s): the right window swaps to the task list (s6-41-tasks-before); cursor-dot click on its checkbox at 6.45 ("on track") and it swaps to s6-43-tasks-after (task under "Selesai"); a "Selesai ✓" stamp pops at 6.80; hold.

- sfx_plan: chime@0.00 · whoosh-short@1.60 · notification@3.00 · pop@3.45 · pop@3.98 · whoosh-short@4.18 · ping@4.74 · click@6.45 · ping@6.80

## Frame 7 — Lewat WhatsApp atau Telegram

- scene: A real Sydia conversation through WhatsApp and Telegram: the user sends a short reminder request; Sydia confirms.
- voiceover: "Kirim pesan langsung dari WhatsApp atau Telegram, seperti mengobrol dengan asisten pribadi."
- duration: 8.35s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/pv/07-messaging.html
- type: feature_showcase
- blueprint: compose
- asset_candidates: assets/whatsapp.svg — WhatsApp glyph; assets/telegram.svg — Telegram glyph; assets/pv-cap/s7-53-chats-answer.png — reference for the real text and bubble colors (do not show this dev page itself)
- conversation (exact real text): user "Ingatkan aku kirim proposal Aurora ke Nadia besok jam 9 pagi ya" → Sydia "Siap, pengingatnya sudah dibuat." + "• Kirim proposal Aurora ke Nadia — Pada 22 Okt 2026, 09.00" (Telegram shows the title in bold)
- beats_local: downbeats 0.00 · 2.09 · 4.18 · 6.26

Scene 1 (0.0–2.6s): caption "Asistenmu, di mana pun kamu <em>berada.</em>" reveals from 0.63. Two phone mockups (rebuilt; WhatsApp: beige `#efeae2` chat bg, green `#d9fdd3` outgoing bubble; Telegram: blue-grey `#dde6ef` bg, `#eef9df` outgoing) — WhatsApp phone enters from the left on "WhatsApp" 1.98; Telegram phone from the right on "Telegram" 2.79 (headers show glyph + "Sydia").
Scene 2 (3.0–5.0s): in both phones the user bubble pops (3.13 / 3.30); typing dots in Sydia's bubble at 3.6.
Scene 3 (4.18–8.35s): Sydia's confirmation bubbles pop on the downbeat 4.18 (WA) and 4.40 (TG) with tiny check ticks; hold.

- sfx_plan: whoosh-short@1.98 · whoosh-short@2.79 · pop@3.13 · pop@3.30 · notification@4.18 · ping@4.40

## Frame 8 — Semua fitur, dalam satu tempat

- scene: Clean bento layout: large headline "Everything. One chat." at top; center tile = Sydia brand card; surrounding tiles for Chat, Pengingat, Tugas, Memori, File, Kalender, Ringkasan Harian, Catatan, Rahasia (Vault), Kontak; on-screen "Semua yang kamu butuhkan. Dalam satu tempat."
- voiceover: ""
- duration: 10.438s
- transition_in: zoom-through
- status: animated
- src: compositions/pv/08-bento.html
- type: feature_showcase
- blueprint: grid-card-assemble
- asset_candidates: assets/sydia-logo.svg — logo for the center tile
- tile copy (label · one real example line): Chat · "Cukup ceritakan" | Pengingat · "Review dengan Nadia · 08.00" | Tugas · "Finalisasi proposal Aurora" | Memori · "Preferensi desain Nadia" | File · "Proyek-Aurora-Brief.pdf" | Kalender · "Kamis · 10.00–11.00" | Ringkasan Harian · "Setiap pagi" | Catatan · "Rangkuman Proyek Aurora" | Rahasia · "Tersimpan aman" | Kontak · "Semua kontakmu" — each with a simple stroke icon (lucide-style inline SVG) and the app's chip colors where they exist.
- layout: headline "Everything. One chat." (English, user's copy) 96px Inter 800 at top (y≈60–160, "One chat." in `<em>`); bento grid y≈200–860 (4 columns × 3 rows with the center brand tile spanning 2×2; tiles white cards radius 22, card shadow); subtitle "Semua yang kamu butuhkan. Dalam satu tempat." 40px muted at y≈880 (keep it above 900 — shrink grid if needed).
- beats_local: downbeats 0.00 · 2.09 · 4.17 · 6.26 · 8.35 (no VO — motion is driven by the beat)

Scene 1 (0.0–0.6s): headline slams in on the downbeat.
Scene 2 (0.52–3.7s): the center brand tile lands first (0.52), then the ten tiles pop one by one on 8th notes (every 0.261s from 1.04: 1.04, 1.30, 1.57, … 3.39), each scale 0.85→1 + fade, power3.out.
Scene 3 (4.17–10.44s): subtitle reveals on the downbeat 4.17; a light aurora sheen sweeps once across the center tile at 6.26; hold the full composition still to the end so viewers absorb it.

- sfx_plan: impact-bass-1@0.00 · pop@0.52 · pop@1.04 · pop@1.30 · pop@1.57 · pop@1.83 · pop@2.09 · pop@2.35 · pop@2.61 · pop@2.87 · pop@3.13 · pop@3.39 · whoosh-short@4.17 · sparkle@6.26

## Frame 9 — Sydia

- scene: A quick recap of the completed Aurora task, calendar, recalled memory and saved note; the interfaces move away, leaving the Sydia logo centered over its signature gradient; "Sydia", "Bukan sekadar menjawab. Membantu kamu menjalani hari.", "Mulai percakapan dengan Sydia".
- voiceover: "Lebih sedikit waktu untuk mengatur. Lebih banyak waktu untuk hal yang berarti. Sydia, asisten pribadi yang selalu siap membantu."
- duration: 13.517s
- transition_in: zoom-through
- status: animated
- src: compositions/pv/09-closing.html
- type: cta
- blueprint: logo-assemble-lockup
- asset_candidates: assets/sydia-logo.svg — logo; assets/pv-cap/s6-43-tasks-after.png — completed task; assets/pv-cap/s3-12-calendar-week.png — calendar; assets/pv-cap/s4-09-answer.png — recalled memory (crop to the answer + bullets only, never the memory-search line); assets/pv-cap/s5-31-notes-workspace.png — saved note
- beats_local: downbeats 0.00 · 2.09 · 4.18 · 6.26 · 8.35 · 10.44 · 12.53
- note: no URL (user decision); final frame may fade out at the very end.

Scene 1 (0.0–5.6s): four recap cards (rounded windows ~640×400, each showing a cropped real screenshot + a small label: "Tugas selesai", "Kalender", "Diingat", "Catatan") arrange in a 2×2 grid, landing on 0.00 · 0.52 · 1.04 · 1.57; subtle depth (slight scale differences).
Scene 2 (5.66–8.3s): on "Sydia" 5.66 the cards fly outward to the four corners and off-frame with blur while a full aurora bloom (the signature gradient, soft, large, grain) swells behind center; the logo (240px) lands center at 5.93; wordmark "Sydia" reveals beside/under it at 6.26.
Scene 3 (6.6–9.9s): tagline "Bukan sekadar menjawab. Membantu kamu menjalani hari." reveals in two halves (6.66 / 7.64) below the lockup (48px, ink on the soft bloom).
Scene 4 (10.44–13.52s): CTA pill "Mulai percakapan dengan Sydia" (aurora gradient fill, white text, arrow) rises on the downbeat 10.44; a sheen sweeps across it at 11.5; hold; gentle fade of content to the bone ground from 12.8 to the end.

- sfx_plan: pop@0.00 · pop@0.52 · pop@1.04 · pop@1.57 · whoosh@5.60 · chime@5.93 · sparkle@6.26 · pop@10.44 · sparkle@11.50
