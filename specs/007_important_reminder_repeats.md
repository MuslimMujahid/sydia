# Important reminder repeats

Status: agreed implementation specification.

## Purpose and dependencies

An important reminder keeps sending until the user acknowledges it. The repeats
stop at a fixed cap, and a final note is sent when they do.

Prerequisite: [006 Reminder occurrence lifecycle](./006_reminder_occurrence_lifecycle.md).

The ways repeats stop are defined in:

- [008 Reminder snooze](./008_reminder_snooze.md)
- [010 Assistant reminder tools](./010_assistant_reminder_tools.md)
- [011 Reminder dashboard UI](./011_reminder_dashboard_ui.md)

## Rules (agreed)

- **Interval:** the gap between repeats is `Reminder.repeatIntervalMinutes`, default 5, range 5–60.
- **Cap:** at most **10 reminder messages per occurrence**, counting the first send, so 1 + 9 repeats.
  - One interval after the 10th message, if the occurrence is still `awaiting_ack`, a single final note is sent and the occurrence becomes `expired`.
  - An `expired` occurrence can still be snoozed by replying to it.
- **What stops repeats:** acknowledging or snoozing (on any channel or the dashboard), deleting the reminder, switching it to regular, or rescheduling it.
- **Interval change:** a new interval applies from the next repeat onward. The pending repeat is re-timed to `lastSentAt + newInterval`, or sent immediately if that time has passed.
- **Recurring reminders:** when the next occurrence of a recurring important reminder dispatches, any older `awaiting_ack` occurrence of that reminder becomes `superseded` and stops repeating. Acknowledging only affects the current occurrence; the schedule continues.
- **Quiet hours:** repeats **ignore quiet hours**, in the same way reminder dispatch already does.
- **Billing and channels:** repeats follow the existing billing and channel-preference rules in `NotificationService.enqueue`.
  - If the user has no enabled channel, the occurrence stays `awaiting_ack` and is shown on the dashboard.
  - It still advances its repeat count and expires at the cap.
- **Across channels:** acknowledging or snoozing on one channel stops repeats on both, because the state lives on the occurrence.

## Jobs

The existing `reminders` BullMQ queue gains two job names next to `dispatch`.

```ts
type ReminderJob =
  | { reminderId; idempotencyKey; occurrenceId }                // name 'dispatch' (unchanged)
  | { kind: 'repeat'; reminderId; occurrenceId; sequence: number } // sequence 2..10
  | { kind: 'final'; reminderId; occurrenceId };
```

- Job ids are `${occurrenceKey}-repeat-${sequence}` and `${occurrenceKey}-final`, with `:` replaced by `-` as today.
- `ReminderSchedulerService.cancel(reminderId)` already removes every delayed or waiting job for the reminder, repeats included.
- A new `cancelFollowUps(occurrenceId)` removes only that occurrence's repeat and final jobs.

### Dispatch (`dispatch` job)

1. Run the existing stale-job checks.
2. Call `markDispatched(occurrence, { important: reminder.important })`. If another worker already dispatched it, stop.
3. Enqueue the notification as before. The kind stays `reminder` and the body comes from the important or regular template.
4. If the reminder is important:
   - call `supersedeAwaiting(reminderId, occurrenceId)`;
   - enqueue `repeat` with `sequence: 2` and a delay of `repeatIntervalMinutes`.
5. Advance a recurring schedule as before.

### Repeat (`repeat` job, sequence N)

1. Load the occurrence. Drop the job if it is missing, not `awaiting_ack`, or `messagesSent ≠ N-1`, or if the reminder is missing or no longer important.
2. Call `recordRepeat(occurrenceId, N-1, now)`. Drop the job if it loses the race.
3. Enqueue a notification with:
   - kind `reminder_repeat`;
   - idempotency key `${occurrenceKey}:repeat:${N}`;
   - `reminderOccurrenceId`, `reminderOccurrenceKey = occurrenceKey`;
   - the repeat template body.
4. If `N < 10`, enqueue `repeat` with sequence `N+1`. Otherwise enqueue `final`. Both use a delay of the reminder's **current** `repeatIntervalMinutes`.

### Final (`final` job)

1. Move `awaiting_ack` to `expired` with a compare-and-set. If that fails, drop the job.
2. Enqueue the notification: kind `reminder_final`, idempotency key `${occurrenceKey}:final`, final-note body.

### Channel currency checks

The `reminder_repeat` and `reminder_final` kinds are not "requested"
notifications. During a WhatsApp outage they are skipped, not replayed later.
Right before sending, the Telegram and WhatsApp delivery paths re-check them
(`NotificationService.reminderFollowUpIsCurrent`):

- a repeat is current only while its occurrence is `awaiting_ack`;
- a final note is current only while its occurrence is `expired`.

A stale follow-up is recorded as `skipped_obsolete` and is not sent.

## Message templates

Rendered in the owner's locale. The regular template is unchanged.

| Template            | Indonesian                                                                                                                       | English                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Important, first    | `⏰⏰⏰ Pengingat penting - {title}\n\nwaktu: {time}\n\n?catatan:\n{notes}\n\nBalas 'oke' kalau sudah, atau 'ingatkan 15 menit lagi'.` | `⏰⏰⏰ Important reminder - {title}\n\ntime: {time}\n\n?notes:\n{notes}\n\nReply 'ok' once done, or 'remind me in 15 minutes'.` |
| Important, repeat N | The same body, with ` (pengingat ke-{n})` after the title.                                                                       | The same body, with ` (reminder #{n})` after the title.                                                         |
| Final note          | `Aku berhenti mengingatkan '{title}'. Balas 'ingatkan X lagi' kalau masih perlu.`                                                | `I'll stop reminding you about '{title}'. Reply 'remind me in X' if you still need it.`                        |

`{time}` is always the occurrence time, not the time the repeat is sent.

## Acceptance criteria

1. An important one-time reminder with interval 5 that is never acknowledged sends 10 reminder messages, at t0, t0+5, …, t0+45 minutes. It then sends a final note at t0+50 and ends `expired`, with `messagesSent=10`.
2. Acknowledging after the 3rd message means no 4th message is sent and no final note is sent.
3. Snoozing, deleting, switching to regular or rescheduling during the cycle stops all further repeats.
4. Changing the interval from 5 to 15 after the 2nd message sends the 3rd message 15 minutes after the 2nd.
5. For a daily important reminder left unacknowledged, the next day's dispatch marks the previous occurrence `superseded`. Its pending repeats send nothing.
6. With billing inactive, no repeat is delivered and the occurrence still expires at the cap.
7. With both Telegram and WhatsApp enabled, each repeat goes to both. An acknowledgement on either one stops both.
8. A regular reminder sends exactly one message, as before.
9. Unit tests for `processReminderJob` cover 1–5 and the template rendering.
