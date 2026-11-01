# Structured record notes

Status: agreed implementation specification. This document does not implement the feature.

## Purpose and scope

Add a general-purpose record note alongside rich-text custom notes and daily
notes. Its authoritative data is a typed table in the database. CSV is an export
format, not the storage model. Expenses, sales, inventory observations, and
measurements are examples, not built-in business categories.

Users and the assistant can create record notes, manage columns, and add, edit,
or delete records. Record notes participate in existing folders, ownership,
note references, editor protection, and Trash behavior. Existing rich-text and
daily-note representations must continue working without conversion.

## Dependencies and policy precedence

This is the foundation for:

- [Deterministic record analysis](./003_deterministic_record_analysis.md).
- [Workspace editing and CSV export](./004_record_notes_workspace_and_csv_export.md).
- [Agent tools and context](./005_record_note_tools_and_context.md).

Reuse the integrity, durable recovery, source preservation, and editor-presence
contracts in [spec 001](./001_capture_and_note_organization.md). Their protections
are prerequisites for assistant mutations. They do not require a fixed capture
pipeline before record-note tools can operate.

For this feature and its integration with ordinary notes, the following decisions
supersede conflicting routing or classification prescriptions in spec 001:

- Provide tools and context; the LLM decides what information to record, its
  destination, the table structure, and which changes to make.
- Do not require an intermediate daily-note write for unspecified material.
- Do not classify business meaning in backend rules, such as transaction versus
  summary, or force those meanings into separate tables.
- Do not prefer individual records over summaries, or the reverse, in code or
  mandatory guidance. Source selection belongs to the LLM.
- Do not impose a fixed meaning for relative date phrases. Supply time context
  and execute the explicit interval chosen by the LLM.

Structural operations such as inserting rows, checking a column type, or enforcing
an expected revision are execution contracts, not business classifications.

## Data contract

Exact schema and public field names are implementation choices. The model must
represent the following without treating table content as a rich-text document:

| Entity             | Required information                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Record note        | Stable identity, owner, title, description/context, folder placement, revision, timestamps, and existing lifecycle metadata        |
| Column             | Stable identity, name, type, order, required/optional setting, and applicable unit/currency or single-choice options               |
| Row                | Stable identity, saved order, typed values keyed by column identity, and source references when available                          |
| Provenance/receipt | Original source identity and version where applicable, applied operation identity, destination row identities, and durable outcome |

Column names and row positions are presentation information. Renaming a column or
deleting another row must not change the identity used to address a stored value.
Row IDs remain stable when their values change. Query results across notes retain
both source note and row identities.

Every successful saved change advances the applicable record-note revision.
Schema, data, counts, and bounds returned together describe the same revision.
Records have a deterministic saved order for direct navigation. The ordering and
position convention must be documented consistently across metadata, reads, the
editor, and export; adding spreadsheet-style cell addresses is not required.

### Supported column types

| Type          | Contract                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Text          | Preserve supplied text without interpreting it as instructions or executable content.                                                |
| Number        | Store interpretable numeric values suitable for reliable arithmetic at the agreed precision; keep other input as a mismatched value. |
| Date          | Represent a calendar date without shifting it through a timezone conversion.                                                         |
| Date-and-time | Preserve an unambiguous instant and sufficient timezone context for display and time grouping.                                       |
| Boolean       | Preserve true and false distinctly from an absent value.                                                                             |
| Single-choice | Store values matching the column's defined choices; keep other input as a mismatched value.                                          |

### Mismatched values

A column type describes how values are interpreted; it does not reject input,
matching spreadsheet behavior. A cell whose input cannot be interpreted as the
column type is saved as a mismatched value: the original input is preserved
exactly as text and marked as not matching the column type.

- Mismatched values are never coerced, rounded, truncated, or replaced with an
  absent value, zero, false, or a guessed date. Clearing a cell is distinct from
  saving a mismatched value.
- A value is reinterpreted only when its column type changes. Values that match the
  new type are stored as typed values; the rest become mismatched values with
  their original input preserved. Changing back reinterprets them again.
- Reads, metadata, and exports distinguish typed values, mismatched values, and
  absent values. Metadata reports the mismatched-value count per column.
- Both interfaces use the same interpretation rules. Mutation results identify the
  cells saved as mismatched values so the assistant can report or correct them.

A numeric column can declare one unit or currency. It must not silently accept
incompatible values or perform automatic currency/unit conversion. Separate
columns or notes can represent different units. Unit metadata is available to
analysis without an expense-specific data model.

Any cell can be absent; there are no required columns. Missing values are never
substituted with zero, false, invented descriptions, or guessed dates. Both
interfaces use the same interpretation rules.

### Schema changes

The LLM may choose the initial schema and add an optional column when warranted;
there is no required approval step for either operation. Assistant-initiated
renames, removals, and type changes require explicit user confirmation through
the existing authorization/confirmation mechanisms.

Manual editor changes follow a proportionate model instead of a blanket
confirmation step:

- Renaming a column and changing its type are direct actions, and the user's
  explicit choice is the confirmation. Column identities are preserved. Any type
  can be selected; values that do not match it become mismatched values as
  described above, so no saved input is lost. The editor offers an undo for the
  applied change.
- Removing a column deletes its values and requires an explicit confirmation that
  names the column and explains the deletion. Following the column-removal undo
  refinement, the open editor offers undo/redo that restores the column's stable
  identity, definition, position and original values across all saved pages.
- Undoing a schema change is a new schema mutation against the current revision.
  It restores the previous column definition and reinterprets current values under
  it, including values edited after the original change.

Adding an optional column leaves earlier rows without a value. Do not backfill
guesses. Changes must preserve unrelated values and column identities. Structurally
invalid changes, such as an unknown type or a stale revision, fail explicitly.
Concrete interpretation rules and confirmation representations are implementation
details, documented and tested consistently across both interfaces.

## Mutations, concurrency, and recovery

- Add, update, and delete support batches. Each batch is atomic: one invalid row,
  stale revision, or blocked commit prevents the entire batch from being applied.
- Updates/deletes identify rows explicitly by stable ID. Changing another row's
  position must not redirect a pending edit. Updating supplied cells preserves
  unrelated cells; clearing a value must be distinguishable from leaving it alone.
- Writes to an existing table use its expected revision. A conflict requires a
  newly resolved operation against current data, not an unconditional stale retry.
- Mutations carry a stable idempotency key. Retrying a committed operation returns
  its durable result without adding rows or applying the change twice. Recording
  the mutation and its receipt must be atomic or equivalently recoverable.
- Equal values or equal text from separate legitimate records are not duplicate
  keys. Provenance protects replay of the same operation; it does not infer that
  two semantically similar rows are the same event.
- Keep original daily captures and original evidence when they exist. Maintain
  source-to-row relationships through corrections and recovery. Deliberately
  deleted rows must not be recreated by replaying previously applied source work.
- Extend the existing owner-scoped presence arbitration to record notes. While
  any registered editor has the table open, all assistant mutations wait durably,
  including schema changes and lifecycle operations. Manual editor saves remain
  available. Reads, analysis, and export use saved data while an editor is open.
- Presence release/expiry, worker restart, or revision conflict must not lose
  pending work. Resume under existing recovery safeguards, validating the current
  revision and source evidence before committing.
- Owner isolation and Trash checks apply to every access path. Do not resurrect a
  trashed note or evade editor protection by creating an alternate destination.

Expected failures use existing typed response/error contracts. Distinguish
validation errors, revision conflicts, deferred writes, and successful commits.
Operational failures are observable and diagnosable without logging private cell
contents unnecessarily. No failure becomes a successful empty result or zero.

## Metadata and content reading

Metadata and table content are separate operations. Metadata returns the schema,
context, note identity/path, revision, counts, and content bounds, not sample rows
or the full table. Content is retrieved through a dedicated paginated operation.

Return declared row/column counts separately from populated-data bounds. Bounds
describe data cells rather than headers, and identify the last populated row and
column by position and stable ID. Zero and false are populated values. Headers
without populated data yield empty data bounds while retaining the schema.
Empty-text handling must be documented and tested consistently without changing
the stored text merely to calculate bounds.

The content-read contract includes:

- Note ID, optional selected column IDs, page size, and cursor/navigation inputs.
- First page, last page, next page, and previous page access without requiring a
  linear traversal to reach the end.
- Stable row identities, saved row positions, selected typed cell values, and the
  source revision. Omitting column selection returns all columns, within documented
  response limits; exceeding a bound must be explicit.
- Page boundaries, available navigation cursors, and table-wide counts and
  populated-data bounds. Global bounds do not shrink to the page or projection.
- Cursors bound to the owner, note, revision, and relevant request shape. If the
  table changes, return an explicit stale-cursor response requiring a restart.
  Do not silently mix versions, skip rows, or repeat rows under the old cursor.

Empty tables and end-of-table are successful states with unambiguous navigation
metadata. Invalid/stale cursors and unavailable tables are distinguishable failures.
Pagination does not require preserved historical snapshots.

## Acceptance criteria and verification

Implement deterministic tests through public contracts for these outcomes:

1. Every supported type round-trips; absence, numeric zero, and boolean false
   remain distinct. Input that does not match the column type is saved as a
   mismatched value with its original text preserved, and is never coerced.
2. Initial schema creation and optional-column addition preserve data. Renames
   preserve column IDs. Changing a type to any supported type succeeds; values
   that do not match become mismatched values, and changing back restores typed
   values without loss. Assistant renames, removals, and type changes without
   confirmation are rejected. Column removal requires confirmation in both
   interfaces. Undo applies against the current revision and loses no input.
3. Add/update/delete batches are atomic. Stale revisions never overwrite current
   values, and retries after commit return the original outcome exactly once.
4. Two distinct equal-valued rows survive; correcting or deleting one targets only
   its ID. Recovery does not recreate a deliberately deleted source-derived row.
5. Metadata contains no row payload. Counts/bounds work for headers-only tables,
   zero/false values, sparse optional cells, and clearing the final populated cell.
6. Forward/backward and first/last navigation cover the saved row order without
   omissions. Projection preserves row IDs and table-wide bounds. A saved change
   between pages rejects the old cursor, including changed-schema cases.
7. Presence arbitration covers tabs/devices and an editor opening during planning.
   Blocked writes survive recovery; open-table reads return saved values.
8. Unauthorized IDs/cursors, Trash, presence failures, and storage failures cannot
   expose another owner's data or appear as successful empty tables.
9. Existing rich-text, daily-note, folder, and lifecycle behavior remains intact.

Follow the backend/database/module AGENTS.md files during implementation. Reuse
repository contracts, Nest module bindings, error envelopes, and existing presence
and mutation services rather than introducing parallel mechanisms. Account for
the current workspace-snapshot repository approach when choosing record storage;
row pagination must not require returning the entire dataset to the caller.

Backend verification uses `bun run test --runInBand` and `bun run check-types`
from `apps/backend`. Each implementation change must also report a runnable
targeted test command for the actual files it adds or changes. These are future
implementation checks, not claims that this specification added executable tests.

## Explicit deferrals and exclusions

Implementation chooses physical tables/JSON layout, endpoints, exact field names,
numeric representation and precision bounds, position convention, cursor encoding,
page/batch limits, confirmation representation, and bounded retry settings. These
choices must preserve the contracts above and be documented and tested.

This release excludes CSV import, stored formula columns, attachments, table
relations/joins, a new accounting subsystem, and bulk historical conversion.
Analysis-time expressions are covered separately by spec 003.
