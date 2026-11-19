# Account settings

All under **Pengaturan** (account menu → Pengaturan).

## Profil (`/settings/profile`)

- **Nama**: the account name.
- **Zona waktu** (timezone): decides when reminders fire and what "today" and "tomorrow" mean. Choose from Asia/Jakarta (WIB), Asia/Makassar (WITA), Asia/Jayapura (WIT), Asia/Singapore, Asia/Kuala_Lumpur, or UTC, then press **Simpan perubahan**. Any other timezone (for example while abroad): ask Sydia in chat, which can set any timezone.
- New accounts start on Asia/Jakarta (WIB). Users in WITA or WIT should change it, or reminders arrive an hour early or late.
- **Bahasa**: Bahasa Indonesia or Bahasa Inggris (English), used for system messages and the few translated screens; most menus are in Indonesian either way. In chat, Sydia replies in the language the user writes in.
- **Email**: shown with **Email terverifikasi**. **Ubah email** (`/change-email`): enter the current password (or confirm with Google) and the new email, press **Kirim kode ke email baru**, then enter the code sent to the new address. The old email stays until the new one is verified.
- **Cara masuk** (sign-in methods): **Ubah kata sandi** sends a reset link (`/forgot-password`); **Hubungkan Google** adds Google sign-in. A forgotten password is reset from the sign-in page the same way.

## Asisten (`/settings/assistant`)

- **Panggilan Pengguna**: how Sydia addresses the user (for example "Kak Dipa"); save with **Simpan panggilan**.
- **Tentang kamu**: occupation, so suggestions fit the user.
- **Persona**: Sydia's tone, from Profesional, Ramah, Ceria, to Jenaka.

## Notifikasi (`/settings/notifications`)

- **Kanal notifikasi**: switches for **Notifikasi Telegram** and **Notifikasi WhatsApp** (usable once the channel is linked). Reminders and briefings are delivered only through Telegram and WhatsApp; the web app does not send notifications.
- **Pengingat tugas terlawat**: how often to nudge about overdue tasks (30 Menit, 1 Jam, 2 Jam, 3 Jam); nothing is sent between 22.00 and 08.00.
- **Briefing**: **Aktifkan briefing harian** (daily summary), **Aktifkan briefing mingguan** with **Hari briefing mingguan**, and **Jam briefing** (time, in the profile timezone).

## Integrasi (`/settings/integrations`)

- **Telegram** and **WhatsApp**: see `channels.md`.
- **Google Calendar**: turn the switch on and sign in with Google. Sync is two-way with the main Google calendar: events from Google appear in Sydia, and Sydia events saved to Google appear there. Turn it off to disconnect. If it says sync is paused ("Sinkronisasi Google dijeda"), turn it off and on again to reconnect.

## Memory

There is no page that lists what Sydia remembers. In chat, the user can ask what Sydia remembers, ask it to remember something ("ingat …"), correct a fact, or forget one ("lupakan …").
