# Reminder dashboard UI

Status: agreed implementation specification.

## Purpose and dependencies

Expose importance, acknowledgement and copy-model snoozing on the reminders
dashboard (`apps/frontend/src/components/reminders/reminder-page.tsx`).

Prerequisites:

- [006](./006_reminder_occurrence_lifecycle.md)
- [008](./008_reminder_snooze.md)

## API types (`reminders.api.ts`)

- **`Reminder` gains:**
  - `important: boolean`
  - `repeatIntervalMinutes: number`
  - `snoozedFrom: { occurrenceId: string; occurrenceAt: string } | null`
  - `latestOccurrence: { id; occurrenceAt; status; messagesSent; lastSentAt; deliveredAt; acknowledgedAt } | null`
- **Inputs:** `CreateReminderInput` and `UpdateReminderInput` gain `important?` and `repeatIntervalMinutes?`. `UpdateReminderInput` loses `snoozeUntil`.
- **New calls:**
  - `snoozeReminder({ reminderId, until, occurrenceId? })` calls `POST /reminders/:id/snooze`.
  - `acknowledgeReminder({ reminderId, occurrenceId? })` calls `POST /reminders/:id/acknowledge`.
  - Both invalidate the reminder lists and Today queries, as the existing mutations do.
  - `useSnoozeReminder` switches to the new endpoint.

## Editor

- **"Penting" / "Important" toggle.** Helper text: "Diingatkan terus sampai kamu konfirmasi" / "Keeps reminding until you confirm".
- **Repeat interval select**, shown only while the toggle is on. The options are **5, 10 and 15 minutes**.
  - If the reminder already has another value, for example 7 set through chat, that value is shown as an extra selected option, "7 menit (custom)".
  - Saving keeps 7 unless the user picks something else.
- Both fields are sent on create and update.

## List rows

- **Important badge:** important reminders show a three-clock badge or icon with the accessible label "Pengingat penting".
- **Awaiting badge:** when `latestOccurrence.status === 'awaiting_ack'`, the row shows a "Menunggu konfirmasi" badge and a **"Konfirmasi"** button that acknowledges that occurrence.
- **Time action:**
  - **"Tunda"** opens the existing quick-time dialog and calls `snoozeReminder`. It appears only when the reminder has a dispatched occurrence (`latestOccurrence` is not null).
  - **"Ubah waktu"** reschedules through `PATCH scheduledAt`, as the dialog does today. It is shown when nothing has fired yet.
- **Copy hint:** a copy shows a muted hint, "Ditunda dari HH:mm", from `snoozedFrom.occurrenceAt`, in the user's local time.
- **Errors:** the existing toast pattern shows the backend's message, e.g. `needs_confirmation` or `too_soon`.

## Chat reminder popover

- The chat entity popover offers "Tunda 1 jam" only when the reminder has fired (`latestOccurrence` is set).
- It snoozes that occurrence to one hour from now and shows "Ditunda sampai …" with the copy's time. The original's details stay unchanged.
- Before the first firing, the popover offers only "Atur pengingat".

## Accessibility

- The toggle is a labelled switch.
- The badges have text, not only an icon.
- Buttons have accessible names that include the reminder title.

## Acceptance criteria

1. Creating an important reminder with interval 10 from the dashboard persists both values.
2. A reminder with interval 7 shows "7 menit (custom)" selected, and saving keeps it.
3. An `awaiting_ack` reminder shows the badge and the Konfirmasi button. Clicking the button clears the badge after the refetch.
4. A reminder that has fired shows "Tunda", and snoozing creates a new row carrying the "Ditunda dari" hint.
5. A reminder that has not fired shows "Ubah waktu" and no "Tunda".
6. The frontend type-checks, and the existing reminder e2e fixtures are updated with the new fields.
