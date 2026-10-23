# Google Calendar behavior verification

Date: 23 October 2026

Status: Implementation and verification complete. Deployment migrations remain to be applied to the target environment.

Scope: [uninterrupted editing specification](./GOOGLE_CALENDAR_SYNC_SPEC.md), including the subsequent instruction to retain the compact Settings row and switch accounts through its off/on toggle.

## Acceptance evidence

| Spec criterion                    | Implementation and discriminating coverage                                                                                                                                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Editable during interruptions  | The editor no longer branches into a read-only copy dialog. Playwright checks a `reconnect_required` event opens and saves through PATCH.                                                                                                                             |
| 2. New events queue during pauses | `createTarget` accepts enabled, authorization-paused sources; local save clocks and operations commit together. Repository and browser tests check destination and pending state. Existing stable-create/recovery contracts check exactly-once provider creation.     |
| 3. Reauthorization                | Settings keeps the toggle enabled while paused, explains the paused state, and reconnects through off/on. Browser tests exercise both desktop and mobile. The live offline-occurrence contract reauthorizes and executes the queued edit against the original source. |
| 4. Deliberate disconnect          | `fenceCalendarBindingForDisconnect` fences workers and detaches retained events. Live tests check local editability, token cleanup, and disconnect after provider preflight preventing PATCH.                                                                         |
| 5. Account switching              | Off/on displays the brief retention notice. Live account-isolation coverage imports the same provider event ID from another account and checks old/private/local-only events remain local with no outbound operations for the new account.                            |
| 6. Calendar switching             | The backend selection API uses the same detachment behavior; no new Settings calendar picker exists. Live tests preserve moved instances and cancellation exceptions across source switches.                                                                          |
| 7. Relinking                      | `saveGoogleConnection` reuses a binding identified by verified Google subject and calendar ID. Live tests edit detached events, reconnect, preserve Sydia IDs, and check no duplicate events.                                                                         |
| 8. Local-only isolation           | Source-switch contracts check deliberately local events never acquire an operation in the new source.                                                                                                                                                                 |
| 9. Independent merges             | Unit, worker, and live tests combine Sydia title/time edits with independent Google location/title edits.                                                                                                                                                             |
| 10. Later overlapping edit wins   | Resolver tests cover local/remote winners, ties, unknown clocks, and atomic recurrence/time groups. Live tests compare explicit edit clocks while database `updatedAt` is artificially newer. Recovery-save failure prevents provider writes.                         |
| 11. Deletion wins                 | Live tests cover pending local deletion versus Google edits, provider 404 before a queued update, series deletion with pending occurrence edits, and confirmed deletion versus a newer queued local edit. Losing values remain recoverable.                           |
| 12. Provider revision races       | Worker/live tests exercise conditional PATCH, fresh reads after ETag changes, request fencing, and conditional deletion against the current ETag.                                                                                                                     |
| 13. Consistent state              | Settings distinguishes enabled/paused from disconnected. Retained detached events use local state; paused events show quiet saved/paused text. Browser checks exercise these states.                                                                                  |
| 14. Retry/switch idempotency      | Existing durable create/completion rollback, queue recovery, generation fencing, and receipt replay contracts remain active. Added recovery restore checks repeat requests and assert one local event with no Google operation.                                       |

## Additional edges

- Recurring occurrence editing resolves locally without calling Google during editor entry. The worker resolves the real instance by series ID and original start; it never guesses a Google event ID.
- Occurrences edited while detached retain their common baseline. A later import attaches the existing row rather than creating a duplicate; queued writes are rebuilt against the current source generation.
- Imported exception rows and cancellation-only tombstones remain associated with their original series after detachment.
- Recovery versions are owner-scoped. Restore creates a separate local event and does not change the provider event or tombstone. History uses bounded pages so older versions remain reachable.
- Recovery history is retained while its source link remains. Existing ordinary tombstone cleanup excludes links referenced by conflict/recovery history. Account deletion and existing privacy deletion semantics continue to apply.
- Three additive migrations add edit clocks, occurrence baselines, and a retained-event transition. Fixture coverage checks inactive linked events, recurring exceptions, pending creates without links, paused old operations, and active legacy conflicts. They have been applied only to the disposable contract database. The transition preserves source identity and schedules a fresh import for active legacy conflicts; unverified identities are never matched by title or email.

## Repeatable checks

Run backend commands from `apps/backend`:

```sh
node node_modules/typescript/bin/tsc --noEmit
node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./jest.config.mjs --runInBand --testPathPatterns='calendar.*spec|phase-tools.spec' --testPathIgnorePatterns='live.spec|request-limiter'
```

For the complete live contracts, use a dedicated synthetic PostgreSQL database named `sydia_calendar_sync_contract` and separate disposable Redis database 15, as required by the existing runbook:

```sh
node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./jest.config.mjs --runInBand --runTestsByPath src/database/repositories/prisma-calendar.live.spec.ts --testTimeout=30000
```

Set `CALENDAR_SYNC_CONTRACT_URL` and `CALENDAR_SYNC_REDIS_CONTRACT_URL` to those disposable services before running. Apply migrations there first. Never use production/development stores for these destructive synthetic contracts.

From `apps/frontend`:

```sh
node node_modules/typescript/bin/tsc --noEmit
bun x playwright test --config playwright.entities.config.ts calendar-sync.spec.ts --workers=2
```

## Final evidence and deployment

- Backend calendar/assistant unit tests: 220 passed across 14 suites on the final behavior.
- Full PostgreSQL/Redis contracts: 98 passed, including automatic transient retry recovery, account isolation, pagination, and deletion completion. After extending the transition to include unlinked pending creates, its fixture regression passed again with the final migration and test path.
- The complete 82-case desktop/mobile browser run passed 78 cases. Two recovery cases used an obsolete exact label; two navigation cases timed out. The corrected recovery cases and both authorization cases passed in a focused run. Reload passed on mobile in that run; desktop initially timed out, then passed independently in 17.9 seconds with a 120-second overall test budget. Assertions were preserved. Thus all cases have passing coverage across runs; the complete suite was not green in a single run.
- Backend/frontend TypeScript and affected-file ESLint checks passed. `git diff --check` passed.
- All 63 migrations applied to the disposable PostgreSQL database. The transition fixture also executes its final SQL against populated synthetic data. No development or production database was migrated.
- Both disposable containers (`sydia-calendar-sync-spec-postgres`, `sydia-calendar-sync-spec-redis`) were removed after verification.
- Provider transport is controlled at the network boundary. No real Google account mutations were performed; this does not establish live OAuth/provider availability.

Before running the updated API and worker in an existing environment, deploy the three migrations in order: `20261023000000_calendar_edit_clocks`, `20261023010000_calendar_occurrence_baseline`, and `20261023020000_calendar_retained_event_transition`. Keep API and worker schema versions aligned. Legacy edit clocks intentionally remain unknown; ties or unknown clocks choose the observed provider version for overlapping fields and retain recovery data.

## Local rollout follow-up

The local app database on localhost:55432 still lacked these migrations when toggle-off was attempted. A read reproduced PostgreSQL `42703` (`column "localEditedAt" does not exist`) in the event-detachment path. Applied all three migrations with `bun run db:migrate:deploy` on 23 October 2026 and verified the calendar edit-clock and occurrence-baseline columns are readable. This supersedes the earlier test-only migration status for the local development database; production remains untouched. The authenticated toggle request has not been retried by the agent.

## Final UI follow-up

Removed the post-disconnect retention notice and the sync-history icon/dialog from `/calendar` at the user's request. Recovery records and backend recovery endpoints remain internal; the frontend recovery component and unused API wrapper were removed. Four desktop/mobile off/on checks and two desktop/mobile checks for the absent history control passed. Affected frontend lint and diff whitespace checks passed. These later UI decisions supersede the earlier history-interface and warning-copy evidence above.
