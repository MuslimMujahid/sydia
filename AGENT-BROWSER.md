# AGENT-BROWSER.md — Sydia

## General

- Frontend http://localhost:3000, backend API http://localhost:5000 (direct XHR from browser, session cookie auth). API routes have NO `/api` prefix (e.g. GET `/users/me/preferences`).
- Demo account: `demo.user@example.test` / `DemoSeed1!` (seeded). Sign-in at `/sign-in?redirect=%2F&reason=required`.
- **"Masuk" (and other) submit buttons sit BELOW the default headless viewport fold (~493px tall); a plain `click @eN` reports success but hits nothing.** Working path: `agent-browser scrollintoview @eN` first, then `click @eN`. No Enter key needed.
- **Private Chrome must be launched detached (`setsid nohup google-chrome --headless=new --remote-debugging-port=<port> --user-data-dir=/tmp/<dir> ... &`)** — a plain backgrounded `&` chrome is killed when the launching shell exits. Drive with `agent-browser --cdp <port>`.
- **Multiple agents may share the default agent-browser daemon/browser** — tabs get navigated under you (observed: drift to 127.0.0.1:3100/chat, extra tabs, foreign sites). For exclusive control, use the private-Chrome recipe above.
- `agent-browser screenshot <path>` ignores the positional path in this setup — files land in `~/.agent-browser/tmp/screenshots/`; copy them out afterward.
- UI is Bahasa Indonesia: Masuk = sign in, Chat = chat, File = files, Kirim pesan = send, Percakapan baru = new conversation, Tambahkan file = attach file.
- A Vite dev error overlay (tanstack-router code-splitter parse error in `__root.tsx:21`) may appear in the accessibility tree as bogus file-path links; the page still renders and works. Ignore those links.
- Main nav (Hari ini / Chat / Tugas / Pengingat / Memori / File / Kontak / Kalender) is behind the "Buka navigasi" button (collapsed by default at small viewport); refs change every snapshot — re-snapshot after each navigation. "Pengaturan" lives in the account menu at the sidebar bottom ("Buka menu akun").
- API fetches from `eval` need `{ credentials: 'include' }` against localhost:5000.
- Long assistant responses stream into `article[aria-label="Jawaban Sydia"]`; read full text via eval in slices (tool output truncates ~768 chars).

## /sign-in

- Fields: textbox "Email", textbox "Kata sandi", button "Masuk" (below fold — scrollintoview before click, see General).
- Fresh profile (new browser) lands on `/onboarding` after login ("Atur zona waktu dan bahasa Anda."); click "Simpan dan lanjutkan" (also below fold — scrollintoview first) to reach `/`. Returning users with saved preferences go straight to `/`.

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
- Composer: file input appears as button "Choose File" (no file chosen); `agent-browser upload @eN <path>` on it works — attachment shows as chip "Hapus lampiran <filename>". "Kirim pesan" is disabled until text is entered; textbox label "Pesan untuk Sydia".
- Sent messages render text only — attachment is NOT shown as a chip inside the sent message bubble (assistant still sees the filename).
- Conversation list shows previews as buttons with "HH.MM" timestamps.
- Response completion indicator: "Jawaban selesai" inside the answer article.

## /files

- Lists all documents with name, size, date and a status badge. `ready` renders as badge "Siap digunakan" with a maroon (brand-deep) dot — that maroon IS the ready state for this theme.
- Direct API check: GET /documents returns documents with `status`, `textContent`, `file.originalName`.

## Document lifecycle

- Chat attach -> POST /documents -> 201 (status processing) -> BullMQ worker -> `ready` in ~4 s (text file). Then POST /conversations/messages -> 201.
