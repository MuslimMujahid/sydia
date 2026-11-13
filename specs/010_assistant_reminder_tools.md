# Assistant reminder tools

Status: agreed implementation specification.

## Purpose and dependencies

Let the assistant create and update important reminders, and acknowledge or
snooze reminders from natural language in Indonesian and English.

Prerequisites:

- [006](./006_reminder_occurrence_lifecycle.md)
- [007](./007_important_reminder_repeats.md)
- [008](./008_reminder_snooze.md)
- [009](./009_reminder_conversation_context_and_replies.md)

## Changes to existing tools

`create_reminder` gains these optional arguments:

- `important` (boolean). Set it only when the user explicitly asks to be reminded until they confirm, for example "penting", "important", "jangan sampai lupa" or "ingatkan terus sampai aku jawab". Never infer it from the content.
- `repeatIntervalMinutes` (integer). Default 5. A value outside 5–60 is **clamped** to 5 or 60, the result reports `repeatIntervalAdjusted: { requested, applied }`, and the assistant tells the user the value it used.

`update_reminder` gains the same two fields, so importance can be switched either way.

- Switching to regular, or rescheduling with `date`/`time`, cancels the current `awaiting_ack` repeats.
- Changing the interval re-times the next repeat ([007](./007_important_reminder_repeats.md)).

`update_reminder` must not be used for snoozing; its description says so.
`delete_reminder` keeps its rule that it is not for snoozing.

`list_reminders` results include `important`, `repeatIntervalMinutes` and
`latestOccurrence.status`, plus `recentDeliveries` ([009](./009_reminder_conversation_context_and_replies.md)).

## New tools (reminders group)

### `acknowledge_reminder`

- **Arguments:** `{ occurrenceId?: string; reminderId?: string }`, at least one required.
- **When to use:** after an important reminder was sent, the user signals they have seen it or dealt with it ("oke", "sudah", "noted", "siap", "👍", "done", "ok", or a reply to the reminder saying so).
- **When not to use:** unrelated chatter. For a regular reminder, "oke" is just conversation and calls no tool.
- **Choosing the target:**
  - For a reply, use its `replyTo.reminder.occurrenceId`.
  - Otherwise the model picks from the awaiting block and history.
  - When several reminders are awaiting and the message clearly covers all of them ("oke semua"), it acknowledges each one.
- **Result:** `{ acknowledged: [{ occurrenceId, reminderId, title }] }`. An empty list means nothing was awaiting.

### `snooze_reminder`

- **Arguments:** `{ occurrenceId?: string; reminderId?: string; minutes?: integer ≥ 1; date?: 'YYYY-MM-DD'; time?: 'HH:mm'; confirmPastNextOccurrence?: boolean }`.
  - Exactly one form must be given: `minutes`, or both `date` and `time` (the user's wall clock, converted on the server like `create_reminder`).
- **When to use:** "ingatkan saya 15 menit lagi", "nanti jam 3 sore", "besok pagi" (09:00), "remind me in an hour", or a reply to a reminder with any of these.
  - A bare "nanti" or "later" with no time means `minutes: 10`.
- **Choosing the target:**
  - A reply identifies it exactly.
  - Otherwise the model picks from its current context, i.e. history references and the awaiting block, or calls `list_reminders` for `recentDeliveries`.
- **Errors:**
  - `not_dispatched`: the reminder has not fired yet, so the assistant uses `update_reminder` to reschedule.
  - `needs_confirmation`: the snooze passes the next recurring occurrence, so the assistant asks the user and retries with `confirmPastNextOccurrence: true` once they confirm.
- **Confirmation:** the assistant always names the reminder and the new local time, e.g. "Oke, pengingat 'rapat' aku tunda ke 14:15", so a wrong pick is easy to notice.
- **Result:** `{ reminder: <copy>, snoozedOccurrenceId, until: { date, time } }`.

## Registration

Add both tools to:

- `TOOL_GROUPS.reminders`;
- the tool labels in `tool-executor.service.ts`, with Indonesian/English labels "Mengonfirmasi pengingat"/"Acknowledge reminder" and "Menunda pengingat"/"Snooze reminder";
- the admin analytics feature map.

They are not background tools.

## Acceptance criteria

1. `create_reminder` with `important: true` and `repeatIntervalMinutes: 3` stores an important reminder with interval 5 and reports the adjustment. With 90 it stores 60.
2. `acknowledge_reminder` on an `awaiting_ack` occurrence returns it, and repeats stop. On a delivered regular occurrence it returns an empty list.
3. `snooze_reminder` with `minutes: 15` creates the copy described in [008](./008_reminder_snooze.md).
4. `snooze_reminder` with `date`/`time` converts using the user's timezone.
5. The `not_dispatched` and `needs_confirmation` errors reach the model as tool errors with readable messages.
6. The tool-group registry validation passes with the new tools.
7. Prompt-eval scenarios are added for Indonesian and English acknowledgement ("oke sudah"), snoozing ("ingatkan saya 15 menit lagi"), a bare "nanti", and a reply-to snooze.
