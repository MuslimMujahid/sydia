# Reminder due-index plan

| Field  | Value                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Date   | 21 November 2026                                                                                                                             |
| Status | Event reminders: shadow period in production since 21 November 2026. Briefings and task follow-ups: shadow period code written, not deployed |
| Scope  | Event reminders first, then task follow-ups and briefings                                                                                    |
| Owner  | Account owner decision, 21 November 2026                                                                                                     |

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

- Event reminders: a due time per user (see section 4), not per event. Recurring events, exceptions, Google tombstones and all-day events in the account timezone are already expanded correctly by the calendar read; storing a per-event time would have duplicated that logic.
- Task follow-ups and briefings: a due time per user and lane (see section 5), recomputed when settings, tasks, pauses or replies change and after each send.
- One query per tick selects rows due within the lookahead that have not been sent and enqueues them with the existing idempotency keys and job ids. Its cost depends on how many items are due, not how many users exist.
- Correctness does not depend on Redis: a lost job or a missed column update is picked up by the next tick, at most one tick late. Delayed jobs are optional.

## 3. Production rollout: run both side by side

Production reminders must not go missing, even for a day. The owner chose a side-by-side (shadow) period over a one-time comparison.

1. **Migration and backfill.** Add the tables and triggers, and mark every user who has a reminder event, in the same release.
2. **Shadow period.** Deploy the due-index query while the existing sweep keeps running. Both produce the same idempotency key and job id, so BullMQ and delivery records prevent double sends. The due-index query uses a slightly longer lookahead than the sweep's 2 minutes, so it should always enqueue first. Whenever the old sweep finds a due reminder with no existing job or delivery, log `reminder_due_index_miss` with the item id and kind (no content). The user still receives the reminder because the old sweep sends it.
3. **Cutover.** Remove the old sweep only after a few days (at least three) with zero misses. Any miss is a bug in a write path or the backfill; fix it and restart the count. Rolling back during the shadow period means keeping the sweep, so no reminder ever depends on unproven code.

### Rejected alternatives

| Alternative                                          | Why not                                                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Delayed job per item plus a daily repair pass        | A missed hook or lost Redis data leaves a reminder unsent for up to a day.                                                                                         |
| One-time comparison script before cutover, no shadow | Catches backfill and recurrence errors in existing data, but not a write path that forgets the column after deploy; those only appear when someone edits an event. |

## 4. Event reminders as built

Migration `20261121200000_event_reminder_due_index`; code in `CalendarReminderService` (`apps/backend/src/modules/calendar/calendar-reminder.service.ts`).

- **Change marks written by database triggers.** `event_reminder_change` gets a row for the owner whenever `calendar_event` or `calendar_event_link` rows are inserted, updated or deleted, when a `calendar_binding` or `calendar_integration` is deleted, and when the account timezone changes. Calendar events are written by many paths (create, update, cancel, copy to local, export to Google, recovery restore, conflict resolution, inbound sync, occurrence materialisation, recurring exceptions, disconnect), and triggers cover all of them, including future ones, without a hook in each. Event and link triggers are statement-level, so a sync batch adds one mark per user per statement. Binding and integration updates (sync cursors, tokens) do not mark.
- **Due time per user.** `event_reminder_schedule.dueAt` is when the user next needs scheduling.
- **Each 30 s tick** lists users with marks or a passed `dueAt` (one query, keyset-paged by user id). For each one it reads the same two-day calendar window as the old sweep, queues reminders due within 3 minutes, and stores the next `dueAt`: 3 minutes before the next future reminder, or one day later if none is in the window. Reminders lead by at most 60 minutes, so a day-later recheck is always early enough. A user stays due until each queued reminder's time passes, so a job lost from Redis is queued again on the next tick. A user with no reminder events loses their schedule row until the calendar changes again. Only the marks read at the start are cleared, so a change committed during processing is processed on the next tick.
- **Shadow comparison.** The due index runs first in each tick, then the old sweep. When the old sweep would queue a future reminder that has no job yet, and the user has no unprocessed change mark, it logs `reminder_due_index_miss` with the user id, event id, start time and reminder time. Job ids are unchanged from the old sweep, so the two paths can never queue a reminder twice. A due-index failure is logged and never stops the old sweep.
- **Verification.** Unit tests are in `calendar-reminder.service.spec.ts`. The trigger and repository contracts are in `prisma-event-reminder.live.spec.ts` (`EVENT_REMINDER_CONTRACT_ENABLED=true`, under the test lock).

## 5. Briefings and task follow-ups as built

Migration `20261121220000_proactive_due_index`; code in `ProactiveSchedulerService` (`apps/backend/src/modules/notifications/proactive-scheduler.service.ts`).

- **Two lanes, `briefing` and `follow_up`,** in `proactive_schedule_change` (trigger-written marks) and `proactive_schedule` (due time per user and lane).
- **Triggers.** A new account, a timezone or ban change, and any `user_preference` change mark both lanes. An `assistance_preference` change (pause or resume), any `task` write and any `message` the user sends (not assistant messages) mark the follow-up lane. Task and message triggers are statement-level.
- **Each 5-minute tick** runs the lane's due index before its legacy sweep. A user is listed when they have marks or a passed due time.
  - Briefing: queue today's briefing when the old rule says it is due (inside the 30-minute window after the briefing time, on a daily or weekly briefing day, channels on, billing active); store the next briefing time over the next eight days, or none.
  - Follow-up: queue the current slot's follow-up when an open task is due and the user is not paused (channels on, billing active); the follow-up job still applies the pause, cap and back-off. Store the first slot at or after the latest of: the task's due time (or now), the end of a timed pause, and the cap or back-off release. An open-ended pause or no open dated task stores none until a mark.
  - A banned account stores none.
- **Shadow comparison.** Queued jobs carry `source: 'due_index' | 'legacy'`; job ids are unchanged, so whichever path queues first wins and nothing is queued twice. When a job the legacy sweep queued actually sends (`status: 'queued'`, not replayed), the worker logs `reminder_due_index_miss` with the lane, user id and time. A due-index failure is logged and never stops the legacy sweep.
- **Verification.** Unit tests are in `proactive-scheduler.service.spec.ts`. Trigger and repository contracts are in `prisma-proactive-schedule.live.spec.ts` (`PROACTIVE_SCHEDULE_CONTRACT_ENABLED=true`, under the test lock).

## 6. Order of work

1. Event reminders (highest risk, 30 s per-user scan today).
2. Task follow-ups and briefings, with the same shadow approach (built; section 5). Follow-ups also have attention limits (21 November 2026: a chat pause stops them, at most 4 per local day, and the wait doubles after each unanswered one, up to a day), which the stored follow-up due time respects.
3. Consider user-created reminders: today they are delayed jobs only, with no repair if Redis loses them. Their occurrences already store a due time and status, so the same due query can cover them.

Related: [Proactive secretary](./PROACTIVE_SECRETARY_SPEC.md) (background sweep removed 21 November 2026; any future outreach is event-driven).
