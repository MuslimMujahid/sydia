# WhatsApp settings design handoff

Date: 22 October 2026

[Open the Penpot design page](https://penpot.muslimmujahid.com/#/workspace?team-id=2d1268b1-32bc-808d-8008-c8176b8b63f5&file-id=4a7e6716-c5b5-8080-8008-c936c7a3dabc&page-id=418d8161-a044-80bf-8008-d3c089d90b03)

Page: **Sydia · Settings · WhatsApp**. Based on the [agreed integration spec](./WHATSAPP_PER_USER_SPEC.md).

## Existing UI inspection

Signed in through agent-browser with the repository's seeded demo account. Inspected the real local Integrasi and Notifikasi screens at desktop and mobile widths before creating designs. The current application route is `/settings/integrations`; `/dashboard/settings` is not a route in this checkout. WhatsApp is hidden by the current feature flag, and `/settings/whatsapp` returns to Integrasi.

Preserved the existing warm background, white service surface, settings navigation, Indonesian copy, Inter typography, and Sydia assets. Reused the Penpot library's Aurora primary-button fill and exact logo. Mobile layouts use the available width rather than reproducing the live page's narrow content column.

## Delivered boards

- Twelve desktop boards: Integrasi entry, QR loading, QR scanning, owner verification, connected, disconnected, expired verification, restriction, logged-out session, disconnect confirmation, replacement confirmation, and number conflict.
- Seven mobile boards: Integrasi entry, QR loading, QR scanning, owner verification, connected, disconnected, and disconnect confirmation.
- Handoff notes on provider-driven transitions, existing notification controls, codes, pending/error behavior, accessibility, and recovery.

All elements are editable Penpot shapes. Selected navigation and confirmation actions have prototype links. Pairing and owner verification still require real provider/inbound confirmation in the implementation; prototype transitions are illustrative. Example numbers and owner-verification codes are fictional fixtures. The QR encodes a design-only marker and cannot log in to WhatsApp.

WhatsApp uses a right-aligned connection switch, matching Telegram and Google Calendar, on desktop and mobile. Switching on starts setup; the switch becomes on after pairing and owner verification succeed. Switching off an active connection opens the disconnect confirmation, and cancellation leaves it connected. This controls the connection, not notification preferences. The separate connection/disconnect buttons were removed where the switch replaces them.

All nineteen boards use the same integrated **Layanan** panel. Telegram and Google Calendar remain visible in every state, including behind confirmation dialogs. WhatsApp expands inline only for the current task; it no longer replaces the service list with a dedicated oversized card. Setup headings use compact label sizing, owner-message fields share a row with their actions on desktop, while the QR sits beside short scanning instructions, and connected/recovery states expose only relevant account information and actions. Mobile stacks the same content within the existing services panel.

## Scope and validation

No notification settings, quiet-hours controls, reserved commands, or shared-number administration were added. Normal notification controls remain in the existing Notifikasi screen.

Representative desktop and mobile boards were exported and visually inspected. All nineteen boards passed the Penpot descendant-containment check. No product source code was changed or implementation behavior tested for this design deliverable.

## QR pairing revision

Assistant-account pairing uses GoWA QR login, replacing phone-number entry and pairing codes. Switching on requests a connection-scoped QR. Scan it from WhatsApp on the dedicated assistant account using **Perangkat tertaut → Tautkan perangkat**. The assistant number comes from the confirmed provider identity after scanning.

The separate owner-verification message remains required. Phone-sized QR setup explains that Sydia must be displayed on another screen for the assistant phone to scan. Do not add a pairing-code fallback. Refresh is user-triggered; expiry uses provider validity, and only provider-confirmed connection advances setup.

The former phone-entry boards now show QR loading. The number-conflict board represents a collision detected after scanning. QR expiry, refresh, and cancellation must invalidate the displayed login attempt. All states retain Telegram and Google Calendar in Layanan.

Final QR revision verification: exported and visually inspected both scanning boards after explicitly resizing the imported QR groups to 165 × 165 px, including the quiet zone. Both retain the other service rows and pass board-containment checks. Updated the canvas handoff notes to remove pairing-code instructions. This verifies the design artwork, not a live GoWA login.

## Connected-account detail revision

The connected desktop board (`418d8161-a044-80bf-8008-d3c1869fb487`) and corresponding mobile board (`418d8161-a044-80bf-8008-d3c2138ae31d`) use two vertically aligned account rows. The assistant row has the Sydia logo and **Nomor asisten** label; the owner row has a user icon and **Nomor pribadi · Terverifikasi** label. Each number has its own edit icon button with a 44 × 44 px target and an explicit accessible action name in implementation. These actions retain the appropriate verified replacement flow.

Remove **Buka chat**, the reminder-settings explanation, and the text **Ganti nomor** button from these two boards. The WhatsApp connection switch, Telegram, and Google Calendar remain present. Other state boards are outside this targeted revision.

Recovery actions in **Koneksi terputus**, **Pesan verifikasi kedaluwarsa**, **Pengiriman dibatasi**, and **Sesi berakhir** use subdued plain text buttons: no fill, border, or shadow, with left-aligned, underlined, medium-weight muted text. Apply this to the existing mobile disconnected board too. Preserve the action labels, interactions, and click areas. Tighten the vertical gaps above the recovery copy, between the copy and action, and before the next service separator.

Owner-verification desktop and mobile boards remove **Buka WhatsApp**. Replace **Salin pesan** with a copy icon button at the right edge inside the verification-message field, retaining a 44 × 44 px target and the accessible name **Salin pesan**. Copy feedback remains **Tersalin**. Reflow the expiry and waiting messages upward after removing the separate action row.

## Confirmation-dialog consistency revision

Both desktop confirmation boards and the mobile disconnect confirmation follow the existing app's `ConfirmDialogSpecimen`, shared `DialogContent`, and `Button` styles. Use a white, 22 px-radius centered dialog with 24 px padding, a 40 px destructive icon badge, centered Inter title (20 px) and description (15 px / 24 px), and adjacent compact actions with an 8 px gap. **Batal** uses `dark-outline`; the confirmation uses the solid red `destructive` variant. Include the existing top-right close affordance and 60% ink backdrop. Preserve the confirmation copy and prototype destinations.

Desktop dialogs are 448 × 261 px; the mobile dialog is 350 × 285 px. Exported and visually inspected all three; every modal descendant fits within its dialog, and cancel, confirmation, and close interactions remain linked. This revision changes design artwork only.
