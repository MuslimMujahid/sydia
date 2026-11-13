# Reminder occurrence lifecycle

Status: agreed implementation specification.

## Purpose and scope

Give every reminder firing an explicit lifecycle so a reminder can be marked
"important", be acknowledged, and be snoozed without changing its recurrence.
This spec is the data foundation for:

- [007 Important reminder repeats](./007_important_reminder_repeats.md)
- [008 Reminder snooze](./008_reminder_snooze.md)
- [009 Reminder conversation context and replies](./009_reminder_conversation_context_and_replies.md)
- [010 Assistant reminder tools](./010_assistant_reminder_tools.md)
- [011 Reminder dashboard UI](./011_reminder_dashboard_ui.md)

Out of scope:

- A per-user default repeat interval.
- Inferring importance automatically.
- A configurable repeat cap (it is fixed; see 007).

## Current behaviour this replaces

- A `Reminder` row stores the schedule. Each firing creates one `ReminderOccurrence`, identified by the idempotency key `${reminderId}:${occurrenceAt ISO}`.
- An occurrence's status is only ever `pending` or `delivered`. A channel consumer sets `delivered` after its send succeeds.
- A one-time reminder is left unchanged after it fires. It falls into the `past` schedule filter because its `scheduledAt` is in the past.

## Data model

### `Reminder`, new columns

| Column                    | Type                          | Rule                                                                                                                                       |
| ------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `important`               | `Boolean @default(false)`     | Set only when the user explicitly asks for it. It can be switched either way later.                                                        |
| `repeatIntervalMinutes`   | `Int @default(5)`             | Whole minutes from 5 to 60 inclusive. It only matters while `important` is true, and it is stored either way so toggling keeps the value.  |
| `snoozedFromOccurrenceId` | `String?`, relation `SetNull` | Set on a snooze copy ([008](./008_reminder_snooze.md)). It points at the occurrence that was snoozed.                                       |

### `ReminderOccurrence`, new columns

| Column           | Type             | Rule                                                                                                                    |
| ---------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `acknowledgedAt` | `DateTime?`      | Set when an `awaiting_ack` occurrence is acknowledged.                                                                  |
| `messagesSent`   | `Int @default(0)` | The number of reminder messages dispatched for this occurrence: the first send plus repeats, excluding the final note. |
| `lastSentAt`     | `DateTime?`      | When the most recent of those messages was dispatched.                                                                  |
| `important`      | `Boolean @default(false)` | A snapshot of `Reminder.important` taken at first dispatch.                                                    |

### Occurrence status values

`status` stays a string column.

| Status         | Meaning                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending`      | Scheduled and not yet dispatched.                                                                                                           |
| `delivered`    | A regular reminder occurrence was dispatched. This is terminal and means "done".                                                           |
| `awaiting_ack` | An important occurrence was dispatched, and repeats continue until it is acknowledged, snoozed, superseded, cancelled or expired.          |
| `acknowledged` | The user confirmed they saw it.                                                                                                             |
| `snoozed`      | The user snoozed it, and a copy reminder now carries the new time.                                                                          |
| `superseded`   | A newer occurrence of the same recurring reminder was dispatched while this one was still `awaiting_ack`.                                   |
| `expired`      | The repeat cap was reached and the final note was sent.                                                                                     |
| `cancelled`    | Repeats stopped because the reminder was switched to regular or rescheduled. The occurrence row is kept for history; deleting a reminder cascades its occurrences instead. |

The existing WhatsApp `obsolete` handling is kept.

Allowed transitions:

- `pending → delivered | awaiting_ack`, at dispatch.
- `awaiting_ack → acknowledged | snoozed | superseded | expired | cancelled`.
- `delivered | acknowledged | expired | superseded → snoozed`, because snoozing a reminder that already fired is allowed.
- `snoozed` stays `snoozed`. Snoozing the same occurrence again creates another copy and does not change its status.

Every transition is a compare-and-set on the expected source status(es), so a
concurrent acknowledgement and repeat cannot both win.

`markOccurrenceDelivered` (called by channel consumers) only stamps
`deliveredAt`/`attemptedAt` when they are unset. It no longer overwrites a
status set at dispatch.

## Repository contract (`IReminderRepository`)

The existing methods stay. `ReminderWrite` gains `important?`,
`repeatIntervalMinutes?` and `snoozedFromOccurrenceId?`. The `Reminder` entity
gains:

```ts
important: boolean;
repeatIntervalMinutes: number;
snoozedFrom: { occurrenceId: string; occurrenceAt: Date } | null;
latestOccurrence: ReminderOccurrenceSummary | null; // newest occurrence that has been dispatched
```

`ReminderOccurrenceSummary` is
`{ id, reminderId, occurrenceAt, status, important, messagesSent, lastSentAt, deliveredAt, acknowledgedAt }`.

New methods (all user-scoped unless the name says otherwise):

- `findOccurrence(userId, occurrenceId)` returns the summary plus `title`, or `null`.
- `findOccurrenceForDelivery(occurrenceId)` is for the worker, which is not user-scoped. It returns the occurrence with its reminder's `userId`.
- `findLatestDispatchedOccurrence(userId, reminderId)`.
- `markDispatched(occurrenceId, { important, at })` moves `pending` to `delivered`/`awaiting_ack` and sets `messagesSent = 1`, `lastSentAt = at` and `important`. It returns whether it won.
- `recordRepeat(occurrenceId, expectedMessagesSent, at)` increments while the occurrence is still `awaiting_ack` and `messagesSent` equals the expected value. It returns whether it won.
- `transitionOccurrence(occurrenceId, from: string[], to, patch?)` is the generic compare-and-set.
- `acknowledge(userId, occurrenceId, at)` moves `awaiting_ack` to `acknowledged`.
- `supersedeAwaiting(reminderId, exceptOccurrenceId)`.
- `cancelAwaiting(reminderId)` moves `awaiting_ack` to `cancelled` and returns the affected ids.
- `listAwaitingAcknowledgement(userId)` lists every `awaiting_ack` occurrence, newest first.
- `listRecentlyDispatched(userId, { since, limit })`.

## Migration

- One Prisma migration adds the columns with their defaults.
- Existing rows keep `pending`/`delivered`, are treated as regular reminders and need no backfill.
- Add the index `@@index([status, lastSentAt])` on occurrences.

## Acceptance criteria

1. Creating a reminder without `important` stores `important=false` and `repeatIntervalMinutes=5`.
2. Dispatching a regular occurrence sets `status=delivered` and `messagesSent=1`.
3. Dispatching an important occurrence sets `awaiting_ack`, `important=true` and `messagesSent=1`.
4. `acknowledge` on an occurrence that is not `awaiting_ack` returns `null` and changes nothing.
5. A second concurrent `recordRepeat` with the same expected count fails.
6. A channel consumer calling `markOccurrenceDelivered` after dispatch leaves `awaiting_ack` intact.
7. Reminder presenters expose `important`, `repeatIntervalMinutes`, `snoozedFrom` and `latestOccurrence`.
8. Repository unit tests cover each transition and each compare-and-set failure.
