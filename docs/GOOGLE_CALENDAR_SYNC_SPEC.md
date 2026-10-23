# Google Calendar uninterrupted editing specification

Date: 23 October 2026

Status: Implemented and verified; target-environment migrations required before rollout.

Latest UI decision: Remove the post-disconnect event-retention notice. Account switching still uses the existing off/on toggle, and events are still retained locally. Remove the sync-history icon and dialog from `/calendar` as well; automatic recovery records remain stored internally. These UI decisions supersede the warning-copy and calendar-history UI requirements below.

This specification updates the [Google Calendar sync implementation plan](./GOOGLE_CALENDAR_SYNC_PLAN.md). Where they conflict, this document governs editing during interruptions, disconnecting, switching sources, reconnecting, and conflict resolution. The existing plan continues to govern unrelated integration scope and infrastructure.

## Intended outcome

Users can keep working with their calendar regardless of Google sync availability. Sydia saves edits locally, synchronizes automatically when possible, and never requires a “Salin ke Sydia” action to make a retained event editable.

Settings and event details must describe the same effective connection state. An enabled integration is distinct from a healthy connection: Google can remain enabled while synchronization is paused pending authorization.

## Agreed decisions

| Situation                                               | Required behavior                                                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google sync enabled and available                       | Save locally and synchronize with the selected Google calendar automatically.                                                                     |
| Temporary provider, network, or credential interruption | Keep event links, accept edits, and queue changes for automatic synchronization after recovery.                                                   |
| New event during an interruption                        | Save immediately and queue for the selected Google calendar while sync remains enabled.                                                           |
| Google requires authorization again                     | Keep editing available and show a persistent reconnect notice in Settings. Resume after authorization.                                            |
| User deliberately disables Google sync                  | Detach linked events from active synchronization and keep them as editable local events. New events stay local.                                   |
| User connects a different Google account                | Warn briefly during connection, retain previous events locally, and detach them from the previous account. Do not upload them to the new account. |
| User selects a different calendar in the same account   | Apply the same warning, retention, and detachment behavior as an account switch.                                                                  |
| User reconnects the original account and calendar       | Relink retained events by their original Google identities and reconcile changes without duplicates.                                              |
| Sydia and Google changed different fields               | Merge automatically.                                                                                                                              |
| Both changed the same field differently                 | The later edit wins; retain the losing version for recovery.                                                                                      |
| One side deleted an event while the other edited it     | Deletion wins; preserve the unsynced or losing edits for recovery.                                                                                |

“Detach” stops active synchronization; it does not erase the historical identity needed for future relinking.

## Connection and event lifecycle

### Connected

The active source is the verified Google account and concrete calendar selected by the user. Linked events synchronize in both directions. Local-only events remain local unless explicitly exported through an existing supported action.

Saving an event must not wait for Google to accept its mutation. A successful local save is durable, and its pending synchronization state remains accurate until Google confirms it. A failed local save must remain visible as a save failure; it must never be presented as saved or merely awaiting sync.

### Temporary interruption or authorization required

Keep the active source identity and event links. Existing events remain editable, and edits, deletions, and new events intended for Google are saved durably for later synchronization.

Retry recoverable failures automatically. When authorization is required, show a persistent “Google sync paused · Reconnect” notice in Settings, localized with the rest of the interface. Reauthorization may require user action, but opening or editing an event must not require it.

Recover against the same source. Synchronization must reconcile queued changes with Google's current state before applying them.

### Deliberate disconnect

Stop synchronization with the source and make its retained events local immediately. Preserve their latest locally saved values and recovery information. Pending mutations must not continue writing to Google after the disconnect takes effect.

New events created while Google sync is disabled are local-only. They do not acquire an automatic Google destination merely because sync is enabled again later.

Retain the original Google identity of previously linked events internally so reconnecting the same source can relink them. Deliberate disconnect is therefore different from a temporary interruption, even though both allow local editing.

### Account or calendar switch

Show a brief warning explaining that existing events will remain in Sydia and stop syncing with their previous source. Do not introduce a per-event copy step or require users to migrate events manually.

When the switch takes effect:

1. Stop writes and pulls for the previous active source, including queued work.
2. Keep its retained events editable locally, preserving their latest saved values.
3. Preserve historical source identities and reconciliation baselines for future relinking.
4. Activate synchronization for the newly selected source and import its supported events.
5. Keep retained events from the previous source local. Never retarget their queued mutations or automatically upload them to the new source.

Apply this behavior both to a different Google account and to a different calendar within the same account.

### Reconnecting a previous source

Identify a source by the stable Google account identity and concrete calendar ID. Identify an event within that source by its original Google event ID; preserve recurring-series and occurrence identities where applicable.

Relink matching retained events in place, preserving their Sydia identity. Do not create an additional Sydia event for the same Google event. Reconcile edits made while detached against the saved common baseline and the current Google version.

Events that were always local-only remain local. Events retained from another source remain local. Never match or retarget events by title, email address alone, or similar dates.

## Reconciliation and authority

Authority is determined from changes relative to the last shared baseline, rather than choosing one whole event as authoritative.

| Comparison against the shared baseline     | Result                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Only Sydia changed a field                 | Preserve and synchronize Sydia's change.                                                      |
| Only Google changed a field                | Apply Google's change to Sydia.                                                               |
| Both changed a field to the same value     | Accept that value without creating a conflict.                                                |
| Different fields changed on each side      | Combine the changes.                                                                          |
| The same field changed to different values | Choose the later edit and retain the losing version.                                          |
| A deletion competes with an edit           | Honor deletion, remove the event from the active calendar, and retain the edits for recovery. |

For example, a title change in Sydia and a location change in Google must both survive. If both sides moved the event to different times, the later time edit wins. A queued edit must not recreate a deleted Google event.

### Metadata requirements

- Retain the Google event's `updated` timestamp, ETag, remote snapshot, and last common snapshot.
- Record the actual Sydia edit time separately from database maintenance and sync completion timestamps. A retry, import, relink, or metadata update must not make an older user edit appear newer.
- Retain source identity and event identity through detachment and reconnection.
- Track local revisions and durable pending work so retries do not produce duplicate events or apply superseded edits.
- Use Google's current ETag for conditional writes. If it changes during reconciliation, fetch the latest version and reconcile again.

Google's `updated` describes the main event data, not individual field edit times, and reminder-only changes do not advance it. It is usable event-level evidence, not proof of when each individual field changed. See the [Google event resource reference](https://developers.google.com/workspace/calendar/api/v3/reference/events).

The agreed later-edit rule requires an explicit implementation policy for timestamp ties, missing timestamps, and fields without reliable edit timestamps. These cases must have a deterministic resolution and preserve the losing or uncertain version. Do not claim field-level timing accuracy that Google does not provide.

### Recovery

Retain sufficient data to inspect and recover overwritten values and edits superseded by deletion. Retention must include the event/source identity, relevant versions, timestamps, and reason for the automatic decision.

Normal editing and synchronization do not require users to review this history. Recovery must be available through a deliberate user action, without automatically restoring deleted events or uploading a detached event to another source.

## Interface requirements

Settings must retain its existing compact integration row. Account switching uses the existing toggle: turn Google Calendar off, then on to choose an account during authorization. Do not add a separate account-switch button, calendar picker, or permanent switch explanation. Show the brief event-retention warning only within the off/on flow. Authorization-paused status may use the existing inline notice, with reconnection through the toggle.

- Remove the read-only interruption and required “Salin ke Sydia” flow for retained Google events.
- Keep the normal editor usable while synchronization is pending or paused.
- Use quiet, accurate event status text to distinguish saved locally, pending sync, and paused sync. Never claim Google has accepted a change before confirmation.
- Keep authorization repair in Settings through a persistent reconnect notice. Do not show an authorization modal whenever an event is opened.
- Show the brief retention/detachment warning as part of switching an account or calendar. It must not become a repeated warning on retained events.
- Derive Settings and event status from consistent connection and source state. An event detached from an old source must not tell the user that the new account needs reconnection.
- Apply the same save and sync semantics to supported assistant mutations and calendar UI mutations.

## Acceptance criteria

1. A linked event opens in the normal editor while Google is unavailable. Saving succeeds locally without copying, and synchronization resumes after recovery.
2. A new event created during a temporary interruption is saved locally and appears once in the intended Google calendar after recovery.
3. Revoked authorization produces a persistent Settings notice while editing continues. Reauthorization resumes queued work against the correct source.
4. Disabling sync retains editable events locally and prevents old queued work from writing to Google. New events remain local.
5. Switching accounts shows the brief warning, retains old events locally, imports the new source, and never uploads old events or sends old operations to the new account.
6. Switching calendars within one account has the same behavior.
7. Reconnecting the original source relinks matching events without duplicate Sydia or Google events and reconciles intervening edits.
8. Reconnecting does not automatically export events created as local-only or events retained from another source.
9. Independent edits, such as a Sydia title change and a Google location change, are both preserved.
10. Competing edits to the same field resolve to the later edit, and the losing version is recoverable. Sync bookkeeping cannot change the winner.
11. A deletion competing with an edit removes the event from the active calendar, preserves the edit for recovery, and does not recreate the event through a queued write or later relink.
12. A provider revision changing during an outbound write triggers fresh reconciliation instead of an unconditional overwrite.
13. Settings and event details remain consistent across connection, interruption, detachment, switching, and reconnection.
14. Repeated retries, worker recovery, and repeated connection callbacks do not duplicate events or apply stale work after a source switch.

## Implementation status and policies

Implementation is complete. See the [verification evidence](./GOOGLE_CALENDAR_SYNC_VERIFICATION.md) for test scope, browser reruns, and rollout requirements.

Implemented:

- Durable local edit clocks and Google modification clocks, independent of synchronization/database bookkeeping. Legacy clocks remain unknown.
- Automatic inbound/outbound resolution, with equal or unknown timestamps retaining the observed provider value for overlapping fields. Independent edits merge regardless of clock availability.
- Resolved recovery records saved before outbound changes. Failed recovery storage prevents an overwrite. Recovery versions remain retained with their source links; ordinary tombstone cleanup excludes links with recovery records.
- Calendar history opens on demand from the calendar toolbar. Users can inspect saved versions and explicitly restore one as a local event. Restoration is owner-scoped and idempotent; it never revives a provider tombstone or uploads to another source.
- Local saves during authorization pauses, including new events and recurring occurrences. Deferred occurrences keep a common baseline and obtain their actual Google instance identity in the worker.
- Explicit disconnect/source switches retain local events and source identities. Reconnection reuses verified bindings and rebuilds writes from retained edits after a fresh pull. Recurring exceptions and cancellation tombstones remain associated with the correct series.
- Deletion wins over edits, including provider deletion discovered before a queued update and series deletion with pending occurrence edits. Conditional deletes read the current ETag and retain the provider version before deleting.
- The additive transition migration converts existing inactive linked events to local state and schedules fresh imports to revisit active legacy conflicts. Unverified legacy identities are never guessed; editing an unlinked legacy row saves it locally.
- Settings retains the existing compact integration row. Account switching uses off/on; the brief retention notice appears only after switching off. There is no calendar picker or separate account-switch button.
- Assistant occurrence mutations use the same local materialization path as the calendar UI.
- A successful completed provider pull automatically resumes exhausted transient writes with a fresh bounded retry episode. Permanent failures stay stopped.

Verification:

- 220 backend unit tests across 14 suites and 98 PostgreSQL/Redis contracts passed.
- All 82 desktop/mobile browser cases have passing coverage across the full run and focused reruns; the full run itself had four failures. See the evidence document for the corrected selectors and navigation timeouts.
- Backend/frontend type checks, affected-file lint, and diff whitespace checks passed.
- Migration fixture coverage preserves inactive recurrence identity and unlinked pending creates, pauses old work, and forces active legacy conflicts through a fresh import.
- Only the disposable database was migrated. Both disposable test containers were removed. Deploy all three additive migrations before running the updated API/worker in another environment.

## Scope boundaries

This change preserves the existing supported Google event types, one-active-source scope, Google authorization model, and separation of Sydia tasks from Google events. It does not authorize uploading previously local events to a newly connected source or expanding Google event type support.
