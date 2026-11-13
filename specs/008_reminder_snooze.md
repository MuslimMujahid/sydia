# Reminder snooze

Status: agreed implementation specification.

## Purpose and dependencies

Let the user postpone a reminder that has already fired. This applies to every
kind of reminder: regular or important, one-time or recurring, still active or
already finished.

Prerequisites:

- [006 Reminder occurrence lifecycle](./006_reminder_occurrence_lifecycle.md)
- [007 Important reminder repeats](./007_important_reminder_repeats.md)

The chat entry point is in [010](./010_assistant_reminder_tools.md) and the
dashboard entry point is in [011](./011_reminder_dashboard_ui.md).

## The copy model (agreed)

A snooze never moves the original reminder's schedule. Snoozing a dispatched
occurrence does the following, in one transaction:

1. The occurrence is moved to `snoozed`.
   - It can come from `awaiting_ack`, `delivered`, `acknowledged`, `expired`, `superseded` or `cancelled`. An occurrence that is already `snoozed` stays `snoozed`.
   - Its pending repeat and final jobs are removed. They would also drop themselves on the status check.
2. A **new one-time reminder** is created at the snooze time.
   - It copies `title`, `notes`, `important`, `repeatIntervalMinutes` and `timezone`.
   - It sets `recurrence = null` and `snoozedFromOccurrenceId` = the snoozed occurrence.
   - Its source is `chat` (with the source message) or `dashboard`.
3. The copy is scheduled through `ReminderSchedulerService.schedule`.

The results:

- A one-time original stays a past, finished reminder.
- A recurring original keeps its schedule unchanged.
- A copy is an ordinary reminder, so it can be snoozed again, which makes a chain.
- An important copy starts a fresh repeat cycle from zero.

## Rules

- **Only dispatched occurrences can be snoozed.** A reminder that has never fired is rescheduled with the existing update path, not snoozed.
  - Asking to snooze it fails with a `not_dispatched` error telling the caller to reschedule.
- **Minimum snooze:** `until` must be at least 1 minute after now. There is no maximum and no limit on how many times something can be snoozed.
- **Past the next occurrence:** if the original is recurring and `until` is at or after its next scheduled occurrence (`Reminder.scheduledAt` once dispatched), the request fails with `needs_confirmation` unless `confirmPastNextOccurrence: true`.
- **Choosing the target:** a request can name an `occurrenceId`, or a `reminderId`, in which case the reminder's latest dispatched occurrence is used.
- **Ownership:** a target that is missing or belongs to another user gives `not_found`.

## Service and interface

`ReminderSnoozeService` lives in `apps/backend/src/modules/reminders`:

```ts
snooze(userId, {
  occurrenceId?: string; reminderId?: string;
  until: Date; confirmPastNextOccurrence?: boolean;
  source: { type: 'chat' | 'dashboard'; messageId?: string | null };
}): Promise<{ reminder: Reminder /* the copy */; snoozed: ReminderOccurrenceSummary }>
acknowledge(userId, { occurrenceId?: string; reminderId?: string }): Promise<ReminderOccurrenceSummary[]>
```

`acknowledge` acts only on `awaiting_ack` occurrences. With a `reminderId` it
acknowledges every `awaiting_ack` occurrence of that reminder. It returns an
empty list when there is nothing to acknowledge.

Errors are `SnoozeError` with codes `not_found | not_dispatched | too_soon | needs_confirmation`.

### REST

- `POST /reminders/:id/snooze`, body `{ until: ISO, occurrenceId?: string, confirmPastNextOccurrence?: boolean }`.
  - Success returns `201` with the copy reminder.
  - `not_found` returns 404.
  - Every other `SnoozeError` returns 400 with a localized message and `details.reason = code`.
- `POST /reminders/:id/acknowledge`, body `{ occurrenceId?: string }`, returns `200 { acknowledged: ReminderOccurrenceSummary[] }`.
- `PATCH /reminders/:id` **loses `snoozeUntil`**. Changing a time there is always a reschedule: it snaps to the rule as before and cancels any `awaiting_ack` repeats ([007](./007_important_reminder_repeats.md)).
- Each successful call writes an audit event, `reminder.snoozed` or `reminder.acknowledged`.

## Acceptance criteria

1. Snoozing a delivered one-time regular reminder by 15 minutes:
   - creates a new one-time regular reminder 15 minutes from now, with the same title and notes and `snoozedFrom` set;
   - leaves the original unchanged apart from its occurrence becoming `snoozed`.
2. Snoozing occurrence `2026-11-13 08:00` of a daily reminder to 08:15 leaves the original's next occurrence at `2026-11-14 08:00`.
3. Snoozing an `awaiting_ack` important reminder stops its repeats and creates an important copy with the same interval. When the copy fires, it repeats from message 1.
4. Snoozing an `expired` occurrence works.
5. Snoozing a never-dispatched reminder returns `not_dispatched`.
6. `until` 30 seconds away returns `too_soon`.
7. For a daily reminder, snoozing to after tomorrow's occurrence without confirmation returns `needs_confirmation`, and with confirmation it succeeds.
8. `PATCH` no longer accepts `snoozeUntil`: the global validation whitelist strips it, so it never moves `scheduledAt`.
9. Unit tests cover 1–7. A controller test covers the HTTP status mapping.
