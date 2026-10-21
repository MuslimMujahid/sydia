---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "Your Life is Everywhere — Sydia brings it into one chat you can just ask."
headline: "Your Life is Everywhere"
destination: website
aspect: 1920x1080
language: id
audience: "Everyday Indonesian users who live in WhatsApp"
length: 136s
angle: chaos-to-one-chat
---

## Intent

A marketing intro video that sells Sydia, a chat-first personal assistant and memory app
(WhatsApp + web), to Indonesian users. Story shape: "chaos → one chat". Open on a life
scattered across chats, notes, files, calendars and screenshots → the English headline
**"Your Life is Everywhere"** → Sydia brings it all together → hero demo → quick feature hits → CTA.

Tone: energetic, upbeat, engaging. Everything is in Bahasa Indonesia (voiceover and
on-screen copy) **except the headline, which stays in English exactly as written:
"Your Life is Everywhere"**.

## Assets

- http://localhost:3000 — the running Sydia app (local dev). Capture it for brand and real UI.
  Demo account supplied by the user for this local app; sign in normally on localhost only.
- /Users/astrea/code/sydia/DESIGN.md — Sydia's own design system (Aurora Haze). Use as brand truth.

## Customizations

- **Must have:** Sydia finding a document from a natural-language request, shown in the
  real app UI (the hero demo beat).
- Voiceover in Bahasa Indonesia, energetic delivery (HeyGen TTS; user is signing in).
- Upbeat background music (HeyGen catalog) and SFX on UI moments.
- Cut to the beat: scene cuts and UI pops land on the music's beat grid.

## Notes

- Delivered as 16:9 1920×1080 for the website / YouTube.
- If the demo account has no searchable documents, upload one or two sample files
  (e.g. a rental-contract PDF) to the local demo account only, so the search demo is real.
- Review shape: scene plan + script for approval → voice pick from samples → sketches → build → preview → render on approval.
- Voice: HeyGen "Calm Cinta – Excited" (8507f6910b7e409b85f0f2bdb4d637a6), picked by ear from 6 samples.
- HeyGen free voice allowance ran out at line 8 (20 Oct 2026). User chose "adapt to fit": frame 8 reuses the
  recorded sample take "Ingetin bayar listrik tiap bulan? Beres!" (then music-only cards), frame 11 uses the
  shorter line "Sekarang, cukup satu chat. Sydia."
- BGM: HeyGen catalog track (29s, 117.5 BPM) extended to full length by bar-aligned looping; frame cuts snapped to its beat grid.
- CTA: no URL — "Mulai ngobrol dengan Sydia" pill + logo.

## v2 — user PV storyboard (21 Oct 2026)

- The user supplied `pv-storyboard/storyboard.md` (9 scenes, Proyek Aurora story) and recorded the VO themselves (`assets/pv/scene_N.mp3`, one narrator). This replaces the v1 script/VO and the AI voiceover.
- Decisions: tighten to ~2:15 (each scene = its VO + demo time, snapped to music bars) · drop the "Your Life is Everywhere" headline · no URL on the end card.
- Captures re-done on the local demo account (Sydia run on port 3010 for this session because port 3000 was taken): Proyek-Aurora-Brief.pdf uploaded; task/event/reminder, Nadia preference (saved to the daily note — memory saving/search is rejected/unavailable in this local setup), summary + note "Rangkuman Proyek Aurora", Aurora task marked done, channel preview reminder.
- v1 files archived in `archive-v1/`.
