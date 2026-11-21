# Reminder due-index plan

| Field  | Value                                                     |
| ------ | --------------------------------------------------------- |
| Date   | 21 November 2026                                          |
| Status | Decided; not implemented                                  |
| Scope  | Event reminders first, then task follow-ups and briefings |
| Owner  | Account owner decision, 21 November 2026                  |

## 1. Problem

Three notification paths decide what is due by scanning every user on a short timer:

| Path            | Timer       | Work per run                                                                            |
| --------------- | ----------- | --------------------------------------------------------------------------------------- |
| Event reminders | Every 30 s  | Loads every user with a reminder event and expands their calendar for the next two days |
| Briefings       | Every 5 min | Loads every user and checks whether their briefing time falls in the window             |
| Task follow-ups | Every 5 min | Loads every user and checks whether their follow-up interval has rolled over            |

The cost grows with the number of users, not with the number of reminders due. The owner does not want per-user periodic processes.

## 2. Decision

**Store each item's next fire time and find due items with one indexed query.**

- Event reminders: a `nextReminderAt` column on calendar events, indexed. Every write path keeps it current, and it advances after each send (for recurring events it holds the next occurrence).
- Task follow-ups and briefings: `nextFollowUpAt` and `nextBriefingAt` on the user preference row, recomputed when settings change and after each send.
- One query per tick selects rows due within the lookahead that have not been sent and enqueues them with the existing idempotency keys and job ids. Its cost depends on how many items are due, not how many users exist.
- Correctness does not depend on Redis: a lost job or a missed column update is picked up by the next tick, at most one tick late. Delayed jobs are optional.

## 3. Production rollout: run both side by side

Production reminders must not go missing, even for a day. The owner chose a side-by-side (shadow) period over a one-time comparison.

1. **Migration and backfill.** Add the columns and fill them for every existing event and user in the same release, including recurring events.
2. **Shadow period.** Deploy the due-index query while the existing sweep keeps running. Both produce the same idempotency key and job id, so BullMQ and delivery records prevent double sends. The due-index query uses a slightly longer lookahead than the sweep's 2 minutes, so it should always enqueue first. Whenever the old sweep finds a due reminder with no existing job or delivery, log `reminder_due_index_miss` with the item id and kind (no content). The user still receives the reminder because the old sweep sends it.
3. **Cutover.** Remove the old sweep only after a few days (at least three) with zero misses. Any miss is a bug in a write path or the backfill; fix it and restart the count. Rolling back during the shadow period means keeping the sweep, so no reminder ever depends on unproven code.

### Rejected alternatives

| Alternative                                          | Why not                                                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Delayed job per item plus a daily repair pass        | A missed hook or lost Redis data leaves a reminder unsent for up to a day.                                                                                         |
| One-time comparison script before cutover, no shadow | Catches backfill and recurrence errors in existing data, but not a write path that forgets the column after deploy; those only appear when someone edits an event. |

## 4. Event write paths that must maintain `nextReminderAt`

Create, update, cancel, copy to local, export to Google, restore from recovery, conflict resolution, Google inbound sync, materialising Google and local occurrences, recurring-series exceptions, all-day events in other timezones, and Google disconnect. The shadow period exists because missing any one of these is a silent miss.

## 5. Order of work

1. Event reminders (highest risk, 30 s per-user scan today).
2. Task follow-ups and briefings, with the same shadow approach.
3. Consider user-created reminders: today they are delayed jobs only, with no repair if Redis loses them. Their occurrences already store a due time and status, so the same due query can cover them.

Related: [Proactive secretary](./PROACTIVE_SECRETARY_SPEC.md) (background sweep removed 21 November 2026; any future outreach is event-driven).
