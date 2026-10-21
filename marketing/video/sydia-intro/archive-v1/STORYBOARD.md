---
format: 1920x1080
duration: 90s
message: "Your Life is Everywhere — Sydia brings it into one chat you can just ask."
arc: PAS with Demo Loop — hook (scattered life) → headline → pain → Sydia intro → ask → answer → benefit → feature cascade → one place → channels → CTA
audience: Everyday Indonesian users who live in WhatsApp
mode: collaborative
language: id
music: upbeat energetic modern pop electronic, bright and positive, driving beat around 120 BPM, punchy drop, no vocals
---

# Sydia — "Your Life is Everywhere" (intro, 16:9, ~90s)

All on-screen copy in Bahasa Indonesia except the English headline **"Your Life is Everywhere"** (frames 2 and 11).
Every product shot is the real app (`capture/assets/…`), framed in a rounded white app window on the bone canvas with a soft aurora bloom behind it.

## Video direction

- **Palette (frame.md, Sydia Aurora):** bone canvas `#fbf8f5` ground on every frame with 2–3 soft blurred aurora blooms (amber `#ffb27a`, coral `#f06694`, violet `#8c5cff`, lilac `#c47bff`) + fractal grain; ink `#171419` for display type; muted `#6b6470` for secondary; pink `#ef5a8a` only for eyebrows, rings, strikes, caret. The aurora gradient fills exactly: "Everywhere" (f2, f11), "Tanya aja." (f7), "Rp 13.000.000" (f6), stamps, and the CTA pill (f11). Real app screenshots sit in white 22px-radius windows with the window shadow. Chips use the app's measured colors (`.sy-chip.doc/reminder/event/task` in `assets/sydia.css`).
- **Type:** Inter only (display 800, tight negative tracking; UI copy 500–700). JetBrains Mono not needed.
- **Motion grammar:** smooth long-tail settles (`power3.out` default, `expo.out` for fast arrivals and the camera burst in f9); no bounce, no `back.out` except where a Scene line explicitly says "playful". Every reveal lands on its VO word or on a music beat (117.5 BPM: beat 0.522s, bar 2.0875s — frame-local beat times are given per frame). Entrances are `fromTo`. No exits (the injected transition is the exit) except f11's final fade. Camera moves = transform on ONE `.cam`/stage wrapper (scale + x/y, `transformOrigin: "0 0"`), never on individual screenshots.
- **Rhythm / holds:** f2 (headline) and f7 (Tanya aja) are punch beats; f6 is the long hero beat; f9 is the breather; f11 holds still on the lockup to the music's drop. Held states stay still — at most subtle jitter (`sine-wave-loop`, tiny amplitude, finite).
- **Negative list:** no slideshow front-loading, no lazy breathing, no slow back-half pan/push, no screensaver float, no random/clock logic, no CSS transitions/keyframes, no `<br>` in copy, no emoji, no real cursor/browser chrome, nothing below y=900 except backgrounds, no narration sentences as on-screen text beyond the short copy already in each sketch.
- **Sketches are confirmed:** each `compositions/frames/NN-*.html` already holds the user-approved layout (pose = final landed state). Build motion INTO that file: keep every element's final position/size/copy; animate from offsets with `fromTo` so the landed state equals the sketch.

## Frame 1 — Hidup yang berserakan

- scene: Fragments of a real life pile in around the frame — a WhatsApp-style chat bubble, a PDF contract card, a calendar invite, a screenshot, a voice-note waveform, a sticky note — each lands on a beat until the frame is crowded.
- voiceover: "Chat penting di WhatsApp. Kontrak di email. Jadwal di kalender. Catatan… entah di mana."
- duration: 9.954s
- transition_in: cut
- status: animated
- src: compositions/frames/01-scattered.html
- type: hook
- persuasion: Pain validation
- beat: overwhelm
- blueprint: overwhelm-surround
- asset_candidates: assets/chat-reminder.png — real chat bubble text for a fragment; assets/page-files-grid.png — PDF thumbnail cards to crop as the contract fragment; assets/page-calendar-week.png — event block crop as the calendar fragment

narrativeRole: name the viewer's real situation in their own words — their life is scattered across apps.
keyMessage: "My stuff is everywhere."

- focal: compositions/frames/01-scattered.html fragments (WhatsApp card, email card)
- roles: fragments = foreground cutouts · "…di mana ya?" = payoff text · ground = background
- blueprint_posture: Adapt — overwhelm-surround's clutter-shove-to-question variant: accumulation under a slow zoom-out, then the camera reverses into a push that shoves the clutter outward and the question builds in the opened center. Keep that variant's signature (shove-to-question); no avatar/morph.
- beats_local: downbeats 1.60 · 3.69 · 5.78 · 7.87 (beat 0.522s)

Scene 1 (0.0–2.4s): stage wrapper starts at scale 1.08 and runs ONE slow steady zoom-out to 1.0 until 6.3s (`multi-phase-camera`). WhatsApp card (#f01-wa) pops in on "Chat" at 0.30 (`spring-pop-entrance`, smooth settle from scale 0.85 + y 24, keep its -3° rotation). E-Tiket chip (#f01-ticket) pops on the downbeat 1.60.
Scene 2 (2.4–4.4s): email card (#f01-mail) slides up on "Kontrak" 2.56 (y 40→0, power3); its PDF chip is inside it. Invoice chip (#f01-invoice) pops on downbeat 3.69.
Scene 3 (4.4–6.2s): calendar card (#f01-cal) slides in from x+60 on "Jadwal" 4.61; "Bayar listrik?" chip (#f01-reminder) pops on "kalender" 5.33; voice-note pill (#f01-voice) slides up on downbeat 5.78 and its waveform bars grow left→right (stagger 0.02).
Scene 4 (6.2–7.6s): sticky note (#f01-note) slaps in on "Catatan…" 6.32 (scale 1.15→1, rotation -9°→-5°, power3) — frame is now crowded.
Scene 5 (7.6–9.95s): on "mana" 7.64 the camera REVERSES into a quick push (stage scale 1.0→1.04 over 0.35s, expo.out) while every fragment shoves radially OUTWARD from the frame center by 90–140px and drops to 0.75 opacity with blur 2px (`center-outward-expansion` inverted), opening the center; "…di mana ya?" (#f01-q, hidden until now) builds word-by-word on the downbeat 7.87 (`dynamic-content-sequencing`: "…di" / "mana" / "ya?" 0.12s apart, y 30→0). Hold; subtle jitter only.

- sfx_plan: pop@0.30 · pop@1.60 · whoosh-short@2.56 · pop@3.69 · whoosh-short@4.61 · pop@5.33 · pop@5.78 · click-soft@6.32 · whoosh@7.62

## Frame 2 — Your Life is Everywhere

- scene: Music drop. The fragments blow outward; the English headline "Your Life is Everywhere" slams in center in heavy Inter, "Everywhere" filled with the grainy aurora gradient.
- voiceover: ""
- duration: 4.175s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/02-headline.html
- type: hook
- persuasion: Pattern interrupt
- beat: tension → curiosity
- blueprint: kinetic-type-beats
- asset_candidates:

narrativeRole: the headline lands on the drop; the one English line, silent VO so the words carry it.
keyMessage: "Your Life is Everywhere."

- focal: #f02-l2 "Everywhere"
- roles: headline = hero · ghost chips = background echo of f1 · blooms = background
- blueprint_posture: Reproduce — kinetic-type-beats via `kinetic-beat-slam` (two slams on consecutive beats, locked finale).
- beats_local: downbeats 0.00 · 2.09 (beats 0.52 · 1.04 · 1.57)

Scene 1 (0.0–0.5s): on the drop at 0.00 the four ghost chips fly outward from center to their edge positions with motion blur (0.35s expo.out with a directional blur 12px→0 on the move) and settle at their blurred 0.35 opacity; "Your Life is" (#f02-l1) slams in at 0.05 (scale 1.35→1, blur 8px→0, opacity 0→1, 0.4s expo.out) — `kinetic-beat-slam`.
Scene 2 (0.52–2.0s): "Everywhere" (#f02-l2) slams in on the next beat 0.52 (scale 1.5→1, y 30→0, blur 10px→0, 0.45s expo.out); blooms swell (scale 0.8→1.1, opacity +0.15) behind it.
Scene 3 (2.09–4.18s): on the downbeat 2.09 the aurora gradient inside "Everywhere" sweeps once (background-position 0%→100% over 1.2s, power2.inOut; give #f02-l2 `background-size: 200% 100%`); then hold still.

- sfx_plan: impact-bass-1@0.00 · whoosh-cinematic@0.00 · sparkle@2.09

## Frame 3 — Pas dibutuhkan, nggak ketemu

- scene: A file-search bar types "kontrak sewa…", folders flip past, results empty — "Nggak ketemu" stamps in; kinetic pain words "Scroll. Buka folder. Cari lagi." land one by one.
- voiceover: "Dan pas butuh satu dokumen penting? Scroll, buka folder, cari lagi… nggak ketemu juga."
- duration: 8.35s
- transition_in: crossfade
- status: animated
- src: compositions/frames/03-not-found.html
- type: pain_point
- persuasion: Pain agitation
- beat: frustration
- blueprint: kinetic-type-beats
- asset_candidates: assets/page-files-list.png — real file list rows to flick past

narrativeRole: agitate the one pain the hero demo will solve — finding a document.
keyMessage: "Finding things is painful."

- focal: #f03-stamp "Nggak ketemu."
- roles: explorer card = supporting surface · pain words = kinetic type · stamp = payoff
- blueprint_posture: Adapt — kinetic-type-beats (pain words landing solo, one per cue) beside a stand-in "old way" folder explorer. Keep the one-word-per-cue slam rhythm.
- beats_local: downbeats 2.09 · 4.17 · 6.26

Scene 1 (0.0–2.6s): explorer card (#f03-explorer) rises in at 0.20 (y 50→0, opacity, power3). Query (#f03-query) types "kontrak sewa" char-by-char 0.70→1.90 behind the pink caret (`discrete-text-sequence`; build the text from an empty span, never CSS-hidden). Folder tiles pop in staggered 0.06s from 0.4.
Scene 2 (2.6–4.5s): "Scroll." (#f03-w1) slams in on "Scroll" 2.77 (x 60→0, blur→0); the folder grid (#f03-grid) does one quick upward flick (y 0→-24→0, 0.35s) as if scrolled. "Buka folder." (#f03-w2) slams on "buka" 3.58; the breadcrumb's last token swaps in place "Final" → "Final-REVISI-2" on "folder" 3.92 (`discrete-text-sequence`; give the bold token its own span with both texts).
Scene 3 (4.5–5.8s): "Cari lagi." (#f03-w3) slams on "cari" 4.61; as each new word lands the previous words dim to light grey (#f03-w1/#f03-w2 ink→#9a939e — the sketch shows them already dim; animate ink→light so the newest is always ink). The "0 hasil" row (#f03-empty) appears and shakes once (x ±8, 3 cycles, 0.3s, finite) on "nggak" 5.59.
Scene 4 (5.84–8.35s): stamp (#f03-stamp) slams on "ketemu" 5.84 (scale 1.6→1, rotation -14°→-6°, opacity 0→1, 0.3s expo.out); hold still.

- sfx_plan: typing@0.70 · whoosh-short@2.77 · whoosh-short@3.58 · whoosh-short@4.61 · error@5.84

## Frame 4 — Kenalin, Sydia

- scene: The scattered fragments from frame 1 return and collapse into the center, becoming the Sydia logo; wordmark "Sydia" and the line "Semua hidupmu, satu chat." resolve beside it.
- voiceover: "Kenalin, Sydia — asisten pribadi yang ngumpulin chat, dokumen, jadwal, dan catatanmu jadi satu."
- duration: 8.35s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/04-meet-sydia.html
- type: product_intro
- persuasion: Negative contrast → relief
- beat: relief + curiosity
- blueprint: constellation-hub
- asset_candidates: assets/sydia-logo.svg — official Sydia logo, gradient badge

narrativeRole: name the product as the answer to frames 1–3; the value claim lands here (beat 4, right after the setup).
keyMessage: "Sydia puts it all in one chat."

- focal: #f04-logo Sydia mark
- roles: logo + wordmark = hero (center) · six chips = orbiting nodes · dashed lines = connectors
- blueprint_posture: Reproduce — constellation-hub with `avatar-cloud-network` (nodes on a ring with connector lines to the hub), nodes landing as the VO names them.
- beats_local: downbeats 0.00 · 2.09 · 4.18 · 6.26

Scene 1 (0.0–1.2s): blooms swell behind center (`ambient-glow-bloom`); the Sydia mark (#f04-logo) lands on "Kenalin" 0.30 (scale 0.6→1, rotation -8°→0, blur 6px→0, power3 — smooth, no overshoot).
Scene 2 (1.24–2.8s): wordmark (#f04-word) rises letter-by-letter on "Sydia" 1.24 (`dynamic-content-sequencing`, per-letter y 40→0 stagger 0.04; wrap letters in spans).
Scene 3 (3.3–6.7s): each chip flies in from beyond its outer side toward its ring slot and its dashed connector draws from the chip to the hub (`svg-path-draw` on the matching `<line>`) as the VO names it: #f04-n1 WhatsApp on "chat" 3.33 · #f04-n2 doc on "dokumen" 4.05 · #f04-n4 Meeting on "jadwal" 5.04 · #f04-n3 note on "catatanmu" 6.27 · #f04-n5 + #f04-n6 together on 6.60. (Lines must start hidden via fromTo strokeDashoffset — give each line an id #f04-l1..l6 matching its chip.)
Scene 4 (7.0–8.35s): tagline (#f04-tag) reveals word-by-word on "jadi satu" 7.04–7.30 (y 24→0, opacity); connector dashes flow once toward the hub (finite strokeDashoffset tween, 1.0s); hold.

- sfx_plan: chime@0.30 · whoosh-short@1.24 · pop@3.33 · pop@4.05 · pop@5.04 · pop@6.27 · pop@6.60 · sparkle@7.30

## Frame 5 — Cukup tanya

- scene: The real Sydia chat, "Ingin melakukan apa hari ini?"; the query types live in the composer: "Dokumen sewa apartemen aku yang tahun lalu mana ya? Uang jaminannya berapa?" — send button pulses and is pressed.
- voiceover: "Cukup tanya, kayak ngobrol sama teman: dokumen sewa apartemen aku yang tahun lalu mana ya?"
- duration: 8.35s
- transition_in: blur-crossfade
- status: animated
- src: compositions/frames/05-ask.html
- type: feature_showcase
- persuasion: Show-don't-tell proof
- beat: curiosity
- blueprint: prompt-type-submit-generate
- asset_candidates: assets/hero-00-empty.png — empty chat with centered composer (typing overlay base); assets/hero-01-typed.png — query typed, send active

narrativeRole: the must-have demo begins — natural language, no file name, no folder.
keyMessage: "You just ask, in your own words."

- focal: the real Sydia composer inside the window (#f05-cam)
- roles: assets/hero-00-empty.png = base plate (background of the window, focal surface) · typed query = HTML overlay rebuilt on the real composer · pill = label
- blueprint_posture: Adapt — prompt-type-submit-generate: the first look IS the composer; the ask types live and ends on the submit press. Keep type-live → submit; the answer belongs to f6.
- beats_local: downbeats 0.00 · 2.09 · 4.18 · 6.26 (beat 0.522)
- build_geometry: window 1360×850 at (280,40); screenshot drawn at 1360×850 inside `#f05-cam` (transformOrigin 0 0). Real composer (window coords): textarea box x 490.2, y 389.9, w 636.6, h 32.1; text origin x 497.8, y 394.6; font Inter 14.17px / line-height 22.67px, color #171419; composer fill #f1f1f1 — cover the placeholder "Tulis pesan atau lampirkan file..." with a #f1f1f1 patch (x 495→1120, y 391→420) once typing starts. Send button center (1146, 406), r≈16: overlay a pink (#ef5a8a→aurora) active circle with a white arrow when the text is complete. Zoomed landing state = the confirmed sketch: `translate(-855px,-346px) scale(1.9)`. SWITCH the base image to assets/hero-00-empty.png (the sketch used hero-01-typed only as a stand-in).

Scene 1 (0.0–2.0s): window rises into place (y 70→0, opacity, power3) at scale 1 (whole real chat visible: "Ingin melakukan apa hari ini?"); "CUKUP TANYA" pill (#f05-pill) pops on "tanya" 0.64.
Scene 2 (2.09–3.4s): on the downbeat the camera zooms to the composer (`coordinate-target-zoom`: cam from x0 y0 s1 → x-855 y-346 s1.9, 1.2s power3.inOut).
Scene 3 (3.5–6.6s): the query "Dokumen sewa apartemen aku yang tahun lalu mana ya? Uang jaminannya berapa?" types into the composer char-by-char behind a 2px pink caret (`discrete-text-sequence`), paced so "mana ya?" completes at 6.40 with the VO, then "Uang jaminannya berapa?" finishes by 6.9.
Scene 4 (6.9–8.35s): send button turns active (pink fill fades in) and is pressed on the beat 7.30 (press: scale 1→0.86→1, smooth) with a soft ring ripple; hold.

- sfx_plan: pop@0.64 · whoosh-short@2.09 · typing@3.50 · click@7.30

## Frame 6 — Ketemu dalam hitungan detik

- scene: Real working theater — "Sydia sedang menyiapkan jawaban…" → "Sydia sedang menampilkan file…" — then the real answer appears; camera pushes onto the purple doc chip "Kontrak Sewa Apartemen Cendana Residence.pdf", then onto bold "Rp 13.000.000", then the "Sumber · halaman 1" citation glows.
- voiceover: "Dalam hitungan detik, Sydia nemuin dokumennya. Uang jaminannya? Tiga belas juta rupiah — lengkap dengan sumbernya, sampai halamannya."
- duration: 10.438s
- transition_in: cut
- status: animated
- src: compositions/frames/06-found.html
- type: feature_showcase
- persuasion: Show-don't-tell proof
- beat: surprise → clarity
- blueprint: agent-progress-theater
- asset_candidates: assets/hero-02-preparing.png — "Sydia sedang menyiapkan jawaban…"; assets/hero-03-showing-file.png — "Sydia sedang menampilkan file…"; assets/hero-04-answer.png — real answer with doc chip, Rp 13.000.000, Sumber list

narrativeRole: the payoff of the must-have — Sydia finds the document AND answers the question, with a citation.
keyMessage: "It finds the document and the answer."

- focal: assets/hero-04-answer.png doc chip + Rp 13.000.000 (inside #f06-cam)
- roles: status screenshots = in-window state plates · answer screenshot = hero surface · side cards = supporting callouts · rings/underline = emphasis markers
- blueprint_posture: Adapt — agent-progress-theater: trigger → working theater (Sydia's real status lines) → receipt (the answer + callouts landing row by row with the VO). Keep the working-theater → receipt spine.
- beats_local: downbeats 0.00 · 2.09 · 4.18 · 6.26 · 8.35
- build_geometry: window 1180×738 at (120,90); all three screenshots are 1180×738 layers inside `#f06-cam` (transformOrigin 0 0); landed camera = sketch `translate(-402px,-18.5px) scale(1.55)`. Add assets/hero-02-preparing.png and assets/hero-03-showing-file.png as stacked `<img>` layers under the answer image (same box). Rings/underline are already inside the cam in unzoomed coords (#f06-hl-doc, #f06-ul-money, #f06-hl-src).

Scene 1 (0.0–2.0s): cam already at the landed zoom; preparing plate (status "Sydia sedang menyiapkan jawaban…") visible at 0.0; at 0.98 ("detik") it cuts to the showing-file plate (opacity swap 0.15s) — the real working theater.
Scene 2 (2.09–3.3s): on the downbeat 2.09 the answer plate fades in over the status plate (0.25s); the doc ring (#f06-hl-doc) draws on "dokumennya" 2.48 (scale 0.9→1 + opacity, or `css-marker-patterns` circle) and the "Ketemu" stamp (#f06-badge) pops at 2.62 (pop: scale 0.6→1, smooth).
Scene 3 (3.0–6.6s): side card 1 (#f06-c1) slides in from x+80 at 3.00; underline (#f06-ul-money) sweeps left→right (scaleX 0→1, transformOrigin left) on "jaminannya" 3.92; side card 2 (#f06-c2) rises on the downbeat 4.18 and its "Rp 13.000.000" counts up from Rp 0 (`counting-dynamic-scale`, integer steps formatted with dots "Rp 13.000.000") landing exactly at 6.30 as the VO says "rupiah".
Scene 4 (7.2–10.44s): source ring (#f06-hl-src) draws on "sumbernya" 7.47; side card 3 (#f06-c3) rises on downbeat 8.35; "halaman 1" glows pink on "halamannya" 8.70 (`asr-keyword-glow`); hold.

- sfx_plan: notification@0.98 · sparkle@2.09 · ping@2.62 · whoosh-short@3.00 · pop@4.18 · chime@6.30 · pop@8.35

## Frame 7 — Tanya aja

- scene: The File page grid of real PDFs; the rental contract card lifts out and glows while the rest dim; kinetic lines "Nggak perlu hafal nama file." / "Nggak perlu ingat foldernya." then "Tanya aja." in the aurora gradient.
- voiceover: "Nggak perlu hafal nama file. Nggak perlu ingat foldernya. Tanya aja."
- duration: 6.263s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/07-just-ask.html
- type: benefit_highlight
- persuasion: Friction reduction
- beat: ease
- blueprint: titlecard-reveal
- asset_candidates: assets/page-files-grid.png — File page grid with 6 real PDF cards

narrativeRole: translate the demo into the viewer's benefit — memory work is gone.
keyMessage: "No more remembering where you saved it."

- focal: #f07-card (contract card lifted from the real File grid) + "Tanya aja."
- roles: files window = background (dimmed) · lifted card = cutout · struck lines = kinetic type · "Tanya aja." = payoff
- blueprint_posture: Adapt — titlecard-reveal (calm value beat, one clean title held still) with two struck "old way" lines before it.
- beats_local: downbeats 0.00 · 2.09 · 4.17
- build_geometry: the contract card's in-grid spot is (1318,287) size 167×196 in frame coords; its landed sketch box is (1118,236) 456×536. Lift = fromTo x +200 / y +51 / scale 0.366 (transformOrigin 0 0) → x 0 / y 0 / scale 1.

Scene 1 (0.0–1.9s): files window (#f07-win) slides in from x+120 at 0.0 (power3); "Nama file?" (#f07-n1) rises on "hafal" 0.85; its strike (#f07-s1) draws scaleX 0→1 on "file" 1.54 (`css-marker-patterns`).
Scene 2 (2.1–3.6s): "Folder?" (#f07-n2) rises on "ingat" 2.39 (on the downbeat region); strike (#f07-s2) draws on "foldernya" 3.24.
Scene 3 (3.9–6.26s): on downbeat 4.17 the contract card lifts out of the grid to its landed spot (0.6s power3.out) with the pink glow shadow, while the window behind blurs 0→3px (`depth-of-field-blur`); "Tanya aja." (#f07-yes) slams in on "Tanya" 4.27 (scale 1.3→1, blur→0, 0.4s expo.out); hold still.

- sfx_plan: whoosh-short@0.00 · click-soft@1.54 · click-soft@3.24 · whoosh@4.17 · impact-bass-2@4.27

## Frame 8 — Beres semua lewat chat

- scene: Four real chat exchanges cascade in as cards, one per cue: reminder "Bayar listrik · 25 Okt, 09.00 · bulanan" → task "Kirim draft materi kampanye ke tim · Tenggat 23 Okt" → event "Meeting dengan Pak Budi · 21 Okt, 14.00" → note "Ide kado ulang tahun Ibu"; a "Beres ✓" stamp hits on each. VO voices only the first (reminder) card; the task, meeting and note cards then land on the music beat with on-screen request text + "Beres ✓" / "Dicatat ✓" stamps and pop SFX (HeyGen allowance adaptation, approved).
- voiceover: "Ingetin bayar listrik tiap bulan? Beres!"
- duration: 9.394s
- transition_in: crossfade
- status: animated
- src: compositions/frames/08-done-in-chat.html
- type: feature_showcase
- persuasion: Rule of three (+1) / value stacking
- beat: momentum + control
- blueprint: grid-card-assemble
- asset_candidates: assets/chat-reminder.png — reminder request + amber "Bayar listrik" chip; assets/chat-task.png — task request + result; assets/chat-event.png — meeting request + green calendar chip; assets/chat-note.png — note request + "sudah dicatat"

narrativeRole: show breadth beyond documents — the same one chat handles reminders, tasks, events, notes.
keyMessage: "One chat does it all."

- focal: the four exchanges in #f08-list
- roles: chat panel = surface · user bubbles + result rows = accumulating list items · stamps = punctuation
- blueprint_posture: Adapt — grid-card-assemble (accumulating value list, items popping into their slots ~1/sec, co-resident). Keep the co-resident accumulation; slots are chat exchanges.
- beats_local: downbeats 2.09 · 4.17 · 6.26 · 8.35 (beats every 0.522)

Scene 1 (0.0–2.3s): panel (#f08-panel) rises at 0.0 (y 50→0, power3, 0.5s). Exchange 1: user bubble slides in from x+60 at 0.10; result row (reminder chip) rises at 1.20; "Beres" stamp (#f08-st1) pops on "Beres!" 2.12 (`spring-pop-entrance` — the one sanctioned playful overshoot, small: scale 0.6→1.08→1).
Scene 2 (3.13–4.4s): exchange 2 bubble at 3.13 · result 3.65 · stamp (#f08-st2) 4.17.
Scene 3 (4.70–5.95s): exchange 3 bubble at 4.70 · result 5.22 · stamp (#f08-st3) 5.74.
Scene 4 (6.26–9.39s): exchange 4 bubble at 6.26 · result 6.78 · "Dicatat" stamp (#f08-st4) 7.30; hold still to the cut (no scroll needed — all four fit).
(Exchanges 2–4 have no VO by design: they land on the beat with SFX.)

- sfx_plan: whoosh-short@0.10 · pop@1.20 · ping@2.12 · whoosh-short@3.13 · pop@3.65 · ping@4.17 · whoosh-short@4.70 · pop@5.22 · ping@5.74 · whoosh-short@6.26 · pop@6.78 · chime@7.30

## Frame 9 — Semua di satu tempat

- scene: Starts tight on the purple meeting block, zooms out to the full real week view (19–25 Okt) with the meeting on Wed and the task on Fri; reminders and files panels slide in at the sides.
- voiceover: "Semuanya otomatis tersusun rapi, di satu tempat."
- duration: 6.263s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/09-one-place.html
- type: benefit_highlight
- persuasion: Order from chaos
- beat: peace of mind
- blueprint: zoom-out-workspace-reveal
- asset_candidates: assets/page-calendar-week.png — week view with meeting + task; assets/page-reminders.png — Bayar listrik reminder; assets/page-files-list.png — 6 documents list

narrativeRole: the inverse of frame 1 — everything that was scattered is now organized.
keyMessage: "It's all in one place now."

- focal: assets/page-calendar-week.png meeting block → whole week
- roles: calendar window = hero surface · reminder card + files card = supporting
- blueprint_posture: Reproduce — zoom-out-workspace-reveal, Variant B (held close-up, then ONE rapid decelerating pull to the full workspace; frame locks).
- beats_local: downbeats 1.04 · 3.13 · 5.22
- build_geometry: calendar screenshot drawn 1260×788 inside `#f09-cam` (transformOrigin 0 0); the purple "Meeting dengan Pak Budi" block centers at window (641,385). Tight start: `x -1293, y -761, scale 3.0`; landed: x 0 y 0 scale 1 (= sketch).

Scene 1 (0.0–1.04s): cam held tight on the meeting block (x -1293, y -761, s 3.0) with a tiny drift (x −10px over the window, finite).
Scene 2 (1.04–2.0s): on the downbeat ONE decelerating zoom-out to the full week (0.9s expo.out) — frame locks (signature).
Scene 3 (2.4–6.26s): reminder card (#f09-rem) slides in from x−80 on "di" 2.56; files card (#f09-files) slides in from x+80 on the downbeat 3.13 and its three file rows tick in (stagger 0.15s, opacity + x 16→0); hold still.

- sfx_plan: whoosh-cinematic@1.04 · pop@2.56 · pop@3.13

## Frame 10 — WhatsApp, Telegram, atau web

- scene: The real channel preview: the same Sydia answer rendered in Web chat, Telegram and WhatsApp columns, each panel rising in turn; small channel glyphs above.
- voiceover: "Ngobrolnya bisa lewat WhatsApp, Telegram, atau web — terserah kamu."
- duration: 6.262s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/10-channels.html
- type: feature_showcase
- persuasion: Friction reduction (meet users where they are)
- beat: belonging
- blueprint: comparison-split
- asset_candidates: assets/chats-1.png — Web / Telegram / WhatsApp previews side by side; assets/whatsapp.svg — WhatsApp glyph; assets/telegram.svg — Telegram glyph

narrativeRole: remove the last objection — it lives where they already chat.
keyMessage: "Use it where you already are."

- focal: three channel panels
- roles: title = header · WhatsApp / Telegram / Web panels = equal-weight cards
- blueprint_posture: Adapt — comparison-split with three cards: outer panels enter from opposite wings with mirrored `split-tilt-cards` rotateY tilts (left faces right, right faces left), the center panel rises; inner-edge badges are replaced by each panel's answer bubble popping. Keep the mirrored-wing tilt entry.
- beats_local: downbeats 1.04 · 3.13 · 5.22

Scene 1 (0.0–1.0s): title (#f10-title) slides down and settles at 0.15 (y −30→0, power3).
Scene 2 (1.2–3.4s): WhatsApp panel (#f10-p1) enters from the left wing (x −160, rotateY 28°→0, scale 0.85→1) on "WhatsApp" 1.32; Telegram panel (#f10-p2) rises from below (y 80→0) on "Telegram" 2.05; Web panel (#f10-p3) enters from the right wing (x +160, rotateY −28°→0) on "web" 3.13. Use a perspective parent so the tilt reads.
Scene 3 (3.7–6.26s): in each panel the answer bubble (.f10-ans) pops in, staggered 0.15s, on "terserah kamu" 3.71–4.22; hold still.

- sfx_plan: whoosh-short@0.15 · pop@1.32 · pop@2.05 · pop@3.13 · ping@4.22

## Frame 11 — Satu chat. Sydia.

- scene: Headline callback "Your Life is Everywhere." (English, small, ink) → it condenses into the Sydia logo lockup on a full aurora bloom with grain; tagline "Sekarang, cukup satu chat." and a gradient pill CTA "Mulai ngobrol dengan Sydia". The headline callback plays music-only for ~1.8s, then the VO lands on the logo (voice file carries a 1.8s lead-in).
- voiceover: "Sekarang, cukup satu chat. Sydia."
- duration: 10.203s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/11-cta.html
- type: cta
- persuasion: Callback + simple next step
- beat: inevitability + motivation
- blueprint: logo-assemble-lockup
- asset_candidates: assets/sydia-logo.svg — official Sydia logo

narrativeRole: close the loop on the headline and leave the brand + action.
keyMessage: "Your life, one chat: Sydia."

- focal: #f11-lock (Sydia mark + wordmark)
- roles: callback headline = opener · lockup = hero · tagline = supporting · CTA pill = action
- blueprint_posture: Adapt — logo-assemble-lockup, Brand_Outro variant (the mark lands, the wordmark completes the lockup beside it, the lockup holds) preceded by the English headline callback; the CTA button-build replaces the URL wipe. Final frame: a gentle exit fade is allowed at the very end.
- beats_local: downbeats 1.04 · 3.13 · 5.22 · 7.31 · 9.39
- build_geometry: callback #f11-callback landed = sketch (top 110, 64px). Its opening state is centered at y≈470 and scale 1.9 (fromTo y +360, scale 1.9 → 0/1).

Scene 1 (0.0–2.9s): "Your Life is Everywhere." builds word-by-word at center (opening state y +360, scale 1.9): "Your" 0.20 · "Life" 0.46 · "is" 0.72 · "Everywhere." 1.04 on the downbeat (slam, blur→0); the aurora sweeps once through "Everywhere." at 1.6.
Scene 2 (3.13–3.9s): on the downbeat the callback rises and shrinks to its top slot (0.7s power3.inOut) while the Sydia mark (#f11-logo) lands at center of the lockup (scale 0.5→1, blur→0) and the blooms swell (`ambient-glow-bloom`).
Scene 3 (3.13–5.4s): tagline (#f11-tag) reveals word-by-word with the VO ("Sekarang," 3.13 · "cukup satu chat." 3.81–4.45); the wordmark (#f11-word) slides out from behind the mark (x −120→0, clip/opacity) landing exactly on "Sydia." 5.22.
Scene 4 (6.26–10.2s): CTA pill (#f11-btn) rises at 6.26 (y 40→0, opacity, power3); a light shimmer sweeps across it once on downbeat 7.31; hold still; final fade of the content clip to the bone ground 9.6→10.2 (final frame only).

- sfx_plan: whoosh-short@0.20 · impact-bass-1@1.04 · whoosh@3.13 · chime@5.22 · sparkle@7.31
