# AGENT-BROWSER.md — Sydia

## General

- Frontend http://localhost:3000, backend API http://localhost:5000 (direct XHR from browser, session cookie auth). API routes have NO `/api` prefix (e.g. GET `/users/me/preferences`).
- Demo account: `demo.user@example.test` / `DemoSeed1!` (seeded). Sign-in at `/sign-in?redirect=%2F&reason=required`.
- **"Masuk" (and other) submit buttons sit BELOW the default headless viewport fold (~493px tall); a plain `click @eN` reports success but hits nothing.** Working path: `agent-browser scrollintoview @eN` first, then `click @eN`. No Enter key needed.
- **Private Chrome must be launched detached (`setsid nohup google-chrome --headless=new --remote-debugging-port=<port> --user-data-dir=/tmp/<dir> ... &`)** — a plain backgrounded `&` chrome is killed when the launching shell exits. Drive with `agent-browser --cdp <port>`.
- **The shared agent-browser daemon can deadlock mid-session** (CLI fails with "Resource temporarily unavailable (os error 11)... daemon may be busy or unresponsive"; subsequent commands hang). Recovery that preserves work: launch a detached private Chrome on a fixed port and drive it with `agent-browser --cdp <port>` — CDP mode responds even while the shared daemon is wedged. Kill the private Chrome with `pkill -f "user-data-dir=/tmp/<dir>"` when done.
- **`--session <name>` does NOT isolate browsers** — named sessions share the daemon's single browser; foreign tabs appear (observed 2026-09-09: a "Google Gemini" chrome://glic tab spawned in-session) and your tab can vanish from the browser entirely while sibling tabs survive. For exclusive control, use the private-Chrome recipe above.
- `agent-browser screenshot <path>` honored the explicit path when driven via `--cdp` mode (saved directly to the given path). (Older note: via the shared daemon the path was ignored and files landed in `~/.agent-browser/tmp/screenshots/`.)
- UI is Bahasa Indonesia: Masuk = sign in, Chat = chat, File = files, Kirim pesan = send, Percakapan baru = new conversation, Tambahkan file = attach file.
- A Vite dev error overlay (tanstack-router code-splitter parse error in `__root.tsx:21`) may appear in the accessibility tree as bogus file-path links; the page still renders and works. Ignore those links.
- Main nav (Hari ini / Chat / Tugas / Pengingat / Memori / File / Kontak / Kalender) is behind the "Buka navigasi" button (collapsed by default at small viewport); refs change every snapshot — re-snapshot after each navigation. "Pengaturan" lives in the account menu at the sidebar bottom ("Buka menu akun").
- API fetches from `eval` need `{ credentials: 'include' }` against localhost:5000.
- Long assistant responses stream into `article[aria-label="Jawaban Sydia"]`; read full text via eval in slices (tool output truncates ~768 chars).

## /sign-in

- Fields: textbox "Email", textbox "Kata sandi", button "Masuk" (below fold — scrollintoview before click, see General).
- Fresh profile (new browser) may land on `/onboarding` after login ("Atur zona waktu dan bahasa Anda."); click "Simpan dan lanjutkan" (also below fold — scrollintoview first) to reach `/`. Returning users with saved preferences go straight to `/`. (Observed 2026-09-09: a brand-new private profile went straight to `/` — onboarding apparently skipped when preferences already seeded server-side for the account.)

## /onboarding

- Timezone (Zona waktu) + language (Bahasa) comboboxes, "Simpan dan lanjutkan" button. Completing it redirects to `/`.

## Consumer role separation (verified 2026-09-07)

- Demo user nav has NO Admin entry (Hari ini / Chat / Tugas / Pengingat / Memori / File / Kontak / Kalender / Pengaturan; no admin-labelled link/button anywhere on `/`).
- Direct `http://localhost:3000/admin` as the demo user redirects to `/` (page title "Hari ini · Sydia").

## /settings/profile

- "Gaya respons" persona radio group: values `professional` (Profesional), `casual` (Gaul), `supportive` (Suportif), `firm` (Tegas), `motivator` (Motivator). Default checked: Suportif.
- **The native radio inputs are visually hidden (1x1px at -1,-1; Base UI). Clicking the snapshot `@eN` ref or the input does nothing.** Working path: `eval` -> `input.closest('label').scrollIntoView({block:'center'})`, then `agent-browser click "label#<label-id>"` (label id pattern `base-ui-_r_<n>_-label`). The group sits below the fold at 900px viewport height — scrolling is mandatory.
- Selecting a radio auto-saves immediately (no submit button); confirmation text appears on the page: "Gaya respons disimpan dan berlaku untuk pesan Anda berikutnya."
- Verify persisted value: `fetch('http://localhost:5000/users/me/preferences', {credentials:'include'})` -> `{data: {persona, automaticMemoryEnabled}}`.
- "Simpan perubahan" button belongs to the Name/timezone/language form only, not the persona radios.

## /chat

- `/chat` with no id loads the MOST RECENT conversation (messages append there). For a fresh conversation, click "Buka daftar percakapan" -> "Percakapan baru" (inside the drawer; heading becomes "Percakapan baru").
- Opening an existing conversation: click its preview button in the sidebar list (shows "HH.MM" timestamp + answer preview) — lands on `/?conversation=<id>`.
- **Conversation list previews show the latest persisted assistant answer text** — enough to confirm an answer persisted (and roughly its content) without opening the conversation.
- Composer: file input appears as button "Choose File" (no file chosen); `agent-browser upload @eN <path>` on it works — attachment shows as chip "Hapus lampiran <filename>". "Kirim pesan" is disabled until text is entered; textbox label "Pesan untuk Sydia".
- While a run is pending: textbox + "Tambahkan file" disabled, send button label flips to "Mengirim pesan" (disabled); the new answer article shows activity labels, e.g. document-summary run (ordered `read_document` path, verified 2026-09-09): "Sydia sedang mendaftar file…" -> "Sydia sedang membaca dokumen…".
- Sent messages render text only — attachment is NOT shown as a chip inside the sent message bubble (assistant still sees the filename).
- Response completion indicator: "Jawaban selesai" inside the answer article (transient — not present in a later re-render of a persisted conversation; absence is NOT a failure signal).
- Completed answers carry a "Sumber" section listing source documents with page numbers (e.g. "AI-Powered Multilingual Assistant Deck.pdf · halaman 1, halaman 2, …").
- The whole-document summary run (15-step ordered read) terminated well within 150 s (~60 s to persisted answer, verified 2026-09-09).

## /files

- Lists all documents with name, size, date and a status badge. `ready` renders as badge "Siap digunakan" with a maroon (brand-deep) dot — that maroon IS the ready state for this theme.
- Direct API check: GET /documents returns documents with `status`, `textContent`, `file.originalName`.

## Document lifecycle

- Chat attach -> POST /documents -> 201 (status processing) -> BullMQ worker -> `ready` in ~4 s (text file). Then POST /conversations/messages -> 201.

## /contacts (contact groups, verified 2026-09-14)

- TabsList has exactly two tabs: "Kontak" (initially selected) and "Grup". Header action button flips text: "Tambah kontak" on Kontak tab, "Tambah grup" on Grup tab (both carry a plus icon — match on text).
- Grup tab empty state: heading "Belum ada grup" + copy "Satu kontak bisa masuk ke beberapa grup. Buat grup seperti Keluarga atau Kantor untuk mengelompokkan kontak."
- Group row: name StaticText, count button labelled "Lihat kontak di grup <name>" (text "N kontak"), and "Tindakan untuk <name>" menu button -> menuitems "Edit grup" / "Hapus grup".
- "Grup baru"/"Edit grup" dialog: field "Nama grup" (maxLength 40), buttons "Batal"/"Simpan grup". Edit dialog description quotes the name: Perbarui nama grup "<name>". Duplicate name -> inline alert "Nama grup sudah digunakan." (HTTP 409), dialog stays open.
- Clicking the count badge jumps to the Kontak tab with a filter chip (group name StaticText + "Hapus filter" button); clearing restores the full list.
- Contact editor ("Kontak baru"/"Edit kontak") has a "Grup" fieldset: one checkbox per group when groups exist, else the text "Belum ada grup. Buat grup di tab Grup." Group badges on contact rows carry a small colored dot (span.size-2.bg-brand-deep) distinguishing them from alias badges.
- Deleting a group uses a NATIVE confirm: "Hapus grup "<name>"? Kontak di dalamnya tidak akan dihapus." Deleting a contact from its editor uses native confirm "Hapus <name> dari kontak?" — arm `window.confirm` via eval to capture/accept headlessly.
- **Dialog action buttons ("Simpan kontak", "Hapus kontak") also need `scrollintoview` before click** (same below-fold trap as "Masuk"): clicking while out of view closed the dialog with NO request sent and no error. With scrollintoview first, POST /contacts fires (201) normally.

## /chat (reminder verification, 2026-09-15)

- Conversation URLs use `/?conversation=<id>` (NOT `/chat`); sending from the fresh `/` composer redirects there. Extract id via `new URL(location.href).searchParams.get('conversation')`.
- Each assistant turn renders its own `article[aria-label="Jawaban Sydia"]`; multi-turn conversations have several — index with `querySelectorAll(...)[n]`.
- Run-completion poll: button-label matching via eval (`/kirim pesan|mengirim pesan/i` on `textContent`) is flaky when sidebar conversation buttons also contain "Kirim…" prefixes; more reliable is the conversation API: `fetch('http://localhost:5000/conversations/'+id,{credentials:'include'})` -> `assistantRuns.at(-1).status` + `toolInvocations` (name/status/arguments).
- Reminder answers render one "Pengingat tersimpan" card per reminder with text "<title> / <D MMM YYYY, HH.MM> / Berulang mingguan pada <Hari…>" — count cards via `innerText.split('Pengingat tersimpan').length - 1`.
- `reminder.scheduledAt` is a naive timestamp holding the UTC instant (e.g. 17:00 WITA stored as 09:00). The obvious `"scheduledAt" AT TIME ZONE 'Asia/Makassar'` renders the wrong direction; true WITA wall time needs `"scheduledAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Makassar'`.

## /reminders

- List text lives in `<main>`: read via `document.querySelector('main')?.innerText` — `document.body.innerText` is mostly sidebar noise. Recurrence renders as "Berulang mingguan pada Selasa, Jumat" etc. (day names, not just "Berulang mingguan").

## Tabs (shared daemon)

- `agent-browser tab` lists stable ids (`t1`, `t2`); `tab 1` / `tab close 2` with positional integers are REJECTED — use `tab t1`, `tab close t2`.
- `agent-browser get text` REQUIRES a selector argument (`get text <selector>`); bare `get text` errors.

## /chat (SMRT verification, 2026-09-16)

- Conversation API run objects expose ONLY `id, conversationId, assistantMessageId, status, errorMessage, createdAt, updatedAt` — there is NO `toolInvocations` field, so tool usage must be inferred from the rendered `Sumber` aside or persisted message text. Message texts readable via `messages[].content || messages[].text` filtered by `role`.
