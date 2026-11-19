# Chat channels: web, Telegram, WhatsApp

Sydia works in the web app and, once linked, in Telegram and WhatsApp. All channels use the same account: tasks, reminders, notes, files, contacts, and calendar are shared. Chat history is per channel; the web sidebar lists only web chats.

Linking is done on the web: **Pengaturan → Integrasi** (`/settings/integrations`), section **Layanan**. Each channel has an on/off switch. Sydia cannot link a channel from chat; give these steps.

## Telegram (easiest, no extra number)

1. Open Pengaturan → Integrasi and turn on **Telegram**.
2. Telegram opens the Sydia bot; tap **Start**. (If Telegram did not open, use the **lanjutkan di Telegram** link.)
3. The bot replies that Telegram is now connected. Chat with Sydia there.

The link is valid for 10 minutes; if it expired, turn the switch on again for a new one. If the bot says "Tautkan akun Telegram Anda dari pengaturan Sydia terlebih dahulu", the account is not linked yet: follow the steps above.

## WhatsApp (needs two numbers)

Sydia does not have one shared WhatsApp number. The user provides a second WhatsApp number that becomes their own Sydia assistant:

- **Nomor asisten**: a spare WhatsApp number (for example on a second SIM). Do not use the personal number. Its phone is needed once to scan a QR code.
- **Nomor pribadi**: the user's normal WhatsApp, used to chat with Sydia and receive reminders.

The account email must be verified first.

1. Open Pengaturan → Integrasi and turn on **WhatsApp**. A QR code appears.
2. On the phone with the assistant number, open WhatsApp → **Perangkat tertaut** (Linked devices) → **Tautkan perangkat** (Link a device), and scan the QR. If it expired, press **Muat kode QR baru**.
3. Sydia shows a message like `SYDIA-AB12CD34`. From the **personal** WhatsApp, send that exact message to the assistant number shown on screen (**Salin pesan** copies it). It is valid for 10 minutes; **Buat pesan baru** makes a new one.
4. The assistant number replies "WhatsApp terhubung". From now on, chat with that assistant number.

The `SYDIA-…` code only works when sent on WhatsApp from the personal number to the assistant number. Pasting it into web or Telegram chat does nothing; tell the user where to send it.

Common problems:

- "Nomor pribadi masih tertaut ke akun lain": that personal number is linked to another Sydia account; disconnect it there first, or use another number.
- "Nomor asisten ini sudah digunakan akun Sydia lain": choose a different assistant number.
- Change either number with the pencil icon (**Ganti nomor asisten** / **Ganti nomor pribadi**).
- If the WhatsApp connection drops, reminders missed in the meantime arrive later in one summary.

To disconnect, turn the WhatsApp switch off and confirm **Putuskan WhatsApp**. Data in Sydia stays.

## What works in Telegram and WhatsApp

- Text, photos, voice notes (transcribed), and documents; received files are saved to the user's Files.
- Sydia can send saved files back as attachments.
- Groups are ignored: Sydia only answers private chats with its owner.
- `/new` (or `/reset`) starts a fresh conversation; `/stop` cancels work in progress. A chat also starts fresh after 24 hours of silence.

## Where reminders arrive

Reminders and daily briefings are sent to every linked Telegram or WhatsApp channel whose notifications are on (Pengaturan → Notifikasi). The web app does not deliver reminders, so with no channel linked, reminders cannot reach the user; suggest linking Telegram.
