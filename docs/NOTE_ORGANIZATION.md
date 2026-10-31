# Capture and note organization

Implementation reference for [spec 001](../specs/001_capture_and_note_organization.md).
Use the specification's acceptance scenarios for user testing.
Automatic background organization defaults to proposal-only; full acceptance has
not been established.

Remaining checks include broader record interpretation, independent-device and
offline editor behavior, incremental daily evidence and deletion, scheduled
recovery, and the full channel matrix. Some implicit reports still take an
unnecessary daily-note detour, and replies can misstate earlier reported totals
after additional transactions.

## Runtime architecture

Conversation capture uses the existing skill catalog, `load_skill`, and agent tool
loop. The `note-capture` skill guides destination selection and record semantics;
there is no mandatory pre-response note classifier. Original message evidence
and pending work are persisted independently of memory eligibility and settings.
Memory retention remains a separate decision.

The background `NoteAgentCoordinatorService` runs the same skill/tool architecture
with owner-scoped evidence, previous receipts, source timestamps and timezone.
The agent chooses its inspections and edits. Proposal mode records resulting
documents without exposing product-note write tools; apply mode uses protected
mutations. Prior proposals need explicit resolution from confirmed receipts or a
grounded dismissal. Proposal resolution is available only when unresolved
proposal evidence exists.

The execution layer enforces ownership, current source evidence, editor exclusion,
document revisions, valid rich text, durable operation identities and atomic write
receipts. Identical mutations for the same immutable source reuse canonical
receipts; distinct user reports remain distinct. Equivalent alias references may
reuse that same receipt without retiring work or creating a replacement plan.
Actual revised edits retain source-scoped replacement validation.

Open notes register independent editor leases. A note remains protected while any
registered editor holds a live lease, including an unfocused tab. Assistant edits,
links, renames, moves and deletion use the protected tools; manual editor saves
remain available. Releasing one editor does not release another editor's lease.
Retries reread current content and retain unrelated formatting and note links.

## Scheduling and activation

- `BACKEND_NOTE_ORGANIZATION_MODE=proposal` is the default. `apply` enables
  automatic background writes; it is an explicit activation choice.
- This setting does not disable ordinary user-requested conversation captures.
- `BACKEND_MEMORY_DREAM_IDLE_MS` supplies the inactivity interval, defaulting to
  15 minutes. Continued conversation replaces the pending delayed job.
- The worker registers minute recovery and a 24-hour catch-up interval. Catch-up
  is not a fixed local nighttime schedule.
- Source collection considers new messages and dashboard daily-note edits after
  the activation boundary. It does not initiate historical backfill.
- Runs process bounded source batches with bounded model/tool budgets. Failed and
  deferred work remains durable; queue delivery is not the only recovery record.
- Starting the API alone does not run the worker or enable background writes.

## Development review

These authenticated endpoints require `NODE_ENV=development` and act on the
signed-in owner's data:

- `GET /notes/organization/work` inspects work and proposals.
- `POST /notes/organization/review` accepts `mode: "proposal" | "apply"` and an
  optional `sourceWorkId` to select one source. Without that ID it considers a
  bounded owner batch. A selected unknown or foreign ID does not fall back to
  other work.

Development apply reviews exercise real writes. Use an isolated test account.
Work payloads contain private evidence and should not be published in reports.

## Verification

From `apps/backend`, with local database configuration and migrations applied:

```sh
NOTES_CONTRACT_ENABLED=true node --env-file=.env --experimental-vm-modules \
  node_modules/jest/bin/jest.js --config jest.config.mjs --runInBand \
  test/notes/agent-recovery.live.spec.ts \
  test/notes/agent-replanning.live.spec.ts \
  src/modules/conversations/services/note-agent-runner.spec.ts
```

These exercise claimed execution, owner/source isolation, proposal lifecycle,
revision replanning, receipts and recovery. The provider boundary is controlled;
passing this suite does not prove real-model interpretation.

The real-model browser regressions use an authenticated isolated local chat:

- `test/notes/capture-routing.browser.cjs`: implicit/explicit capture, updated
  aggregates or explicitly expected transaction amounts, source receipts,
  preserved formatting/links, unrelated-note isolation and replay.
- `test/notes/non-recording.browser.cjs`: questions and hypothetical messages must
  leave notes unchanged during immediate and selected background processing.

Set `NOTES_CAPTURE_BROWSER_SESSION` for both scripts. Capture checks also require
`NOTES_CAPTURE_OWNER_ID`, `NOTES_CAPTURE_TRACKER_REF`, `NOTES_CAPTURE_TIMEZONE`,
and `NOTES_CAPTURE_AMOUNT_IDR`; `NOTES_CAPTURE_PHASE=organized` includes selected
background apply/replay. Use `NOTES_CAPTURE_MESSAGE` for alternate wording and
JSON arrays `NOTES_CAPTURE_BEFORE_AMOUNTS` / `NOTES_CAPTURE_EXPECTED_AMOUNTS` for
concrete transaction fixtures. The default fixture contains one current-day
aggregate. The no-mutation script requires `NOTES_NON_RECORD_MESSAGE` and optionally
`NOTES_EXPECTED_ANSWER_TEXT`. These checks use the configured provider and may
incur provider charges.

For Web, Telegram and WhatsApp rendering, use the development
[/chats workflow](./CHAT_PREVIEWS.md). Preview data is isolated from normal account
notes; live editor/presence checks belong in regular Web chat.
