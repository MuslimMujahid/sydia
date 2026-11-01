# Record notes

Record notes share `custom:ID` references, ownership, folders, links, revision and
Trash with ordinary notes. `WorkspaceItem.format` dispatches `rich-text` versus
`record`; the record table is never stored or edited as a Tiptap document.
`record_table` stores the ordered schema/context/statistics and `record_row` stores
independently addressable rows. The workspace revision is authoritative.

## Saved data and interpretation

Columns have stable IDs, names, types, optional unit/currency and choice options.
All columns are optional (`required:false`). Values are keyed by column ID, never
by name or position. Rows have stable IDs, source evidence and 1-based saved
positions. Appends assign increasing positions; sorting or inserting around a
stable row ID reassigns presentation positions. Deletion can leave gaps. Content
pages show their ordinal page range, while each returned row includes its saved
position. CSV follows saved order. Neither row nor column identity changes when
presentation order changes.

Cells contain original `raw` text and either `status:typed` with `value` or
`status:mismatched` without a typed value. Absence is a missing cell; `null` in a
mutation clears it, while an omitted key preserves it. Empty text remains saved
but does not contribute to populated bounds. Zero and false are populated.

- Text preserves supplied input.
- Numbers accept decimal strings with at most 18 integral and 12 fractional
  digits, without separators, exponent notation or surrounding whitespace. Input
  is never rounded. Nonmatching input remains original mismatched text. Unit or
  currency labels are explicit numeric-column metadata; there is no conversion.
- Dates accept real ISO calendar dates (`YYYY-MM-DD`) without timezone shifting.
- Datetimes require ISO instants with `Z` or a numeric offset. The typed value is
  normalized to UTC and the supplied timezone/offset and raw input remain saved.
- Booleans accept exact true/false, distinctly from absence. The grid cycles
  absent → true → false → absent; arbitrary text can still be entered as a mismatch.
- Choices match their configured options exactly.

Changing type/options/unit reinterprets raw input, preserving every original
value. Manual rename/type changes apply directly with saved schema undo/redo for the
open editor session against the current revision. Undo reinterprets current cells, including edits
made since the original change, and restores only affected definitions so columns
added later and their values remain intact. Column removal requires inline confirmation
naming the column and deletion of its values. Deleted definitions and raw values are retained in an owner/note-scoped receipt so the editor can undo deletion atomically. Assistant protected schema
changes require explicit user confirmation; creation and optional additions do not.

Column-menu highlighting follows the open menu and clears on dismissal. Removal
preview uses the Penpot destructive state: a 5% `#c0362c` column tint and continuous
1.5 px inset outline across the header and displayed data rows. The inline warning
panel is 260 px wide on desktop with 10 px corners, a warning icon, 32 px buttons,
an outlined Cancel action and a solid destructive action. Compact-screen buttons
retain 44 px touch targets. Cancel receives visible initial focus; Cancel/Escape
restore focus to the column header without removing the column.

## Spreadsheet interaction

Click a cell to focus it with a visible berry outline. Arrow keys move between
cells; Shift+arrows or mouse dragging extend a rectangular selection on the current
page. Selected cells have a tinted background. Copy produces tab/newline-separated
raw values; Delete/Backspace clears the selected rectangle in one atomic batch.

Typing replaces the active value; double-click, Enter or F2 edits the current
value. Enter/Shift+Enter saves and moves down/up. Tab/Shift+Tab saves and moves
forward/backward, wrapping across rows. Escape cancels the current edit and restores
its previous draft/value without discarding other drafts. A save whose outcome is
uncertain must be resolved through the existing recovery UI before cancellation.
While editing text, arrow keys retain normal caret behavior. Compact screens keep
the existing row sheet. At the grid boundary, Tab reaches the surrounding controls;
newly navigated pages retain a keyboard entry cell.

Saved cell edits, rectangular clears, pastes into existing rows and column-definition
changes share chronological undo/redo history for the open editor session.
Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl+Y redo. The toolbar and column-removal toast use the same history. Undo/redo do not show success toasts; committing column removal shows a toast with an Undo action.
Inside text inputs, these keys retain native text undo. A new cell/definition edit
clears redo. Undo writes only the affected stable row/column identities against the
current revision; it never restores a whole stale table. Failed undo/redo commits
retain their operation key and move history only after successful recovery.

## Transactions, presence and replay

All record writes share the owner workspace advisory lock and ambient Prisma
transaction used by ordinary notes. Receipts and writes commit atomically.
Mutation keys are owner scoped, cascade on account deletion, bind exact arguments and replay their original
serialized outcome, even after the resulting row was deliberately deleted.
Equal-valued rows are independent records. Source references remain on corrections.

Production record tools use `protectNoteTools` / `NoteMutationService`. All
assistant row/schema/lifecycle writes arbitrate under the shared presence lock
at commit time. Open editors cause durable `saved:false` deferrals. Recovery uses
the same claimed note-agent tools, source validation, supersession and receipts.
Manual writes require an active owner/note/editor-session lease. Presence renews
every 30 seconds; abandoned leases expire in five minutes. Opening the editable
workspace or chat drawer establishes presence and a current saved version first.
Failed saves retain the live draft and block navigation; retry reuses the pending
operation key. Conflicts expose the latest saved metadata and allow an explicit
merge of local cell changes or explicit draft discard.
The editor reconciles separately fetched metadata/content revisions with at most
three saved reads. Exhaustion is an explicit recoverable error. Successful reload
also clears the failed query state; a failed initial load never becomes an empty table.

## APIs and bounds

Authenticated endpoints are under `/record-notes`:

- `POST /` creates schema/context and a workspace item atomically.
- `GET /:id/metadata` returns schema, revision, counts, mismatch counts and global
  bounds without any row payload.
- `POST /:id/content` accepts selected column IDs, a page size (1–200), first/last
  navigation or a returned cursor. Offset navigation starts a fresh saved read.
  Cursors bind owner, note, revision, page size and projection. Results include
  previous/next/first/last cursors, row IDs/positions and table-wide bounds.
- `POST /:id/mutations` accepts revision, requestKey, editor session and a typed
  change. Add/update/delete batches are atomic and bounded to 200 rows. Mutation mismatch feedback includes affected cell identities (up to 200 with an explicit total/truncation flag) separately from column-wide counts. Schema,
  context, title, saved sorting and mixed paste operations use the same boundary.
- `POST /query` executes mapped structured analysis against saved rows immediately.
- `POST /:id/export` verifies and serializes saved data before issuing a link;
  `GET /:id/csv` downloads directly under owner authentication.

Tables support up to 64 columns and 100,000 saved rows per operation. Analysis
supports at most 20 explicitly mapped sources and 10,000 total input rows, 200
results per page, 30 calculations plus 30 derived metrics, 16 JSON nesting levels,
3,000 query nodes and a five-second evaluator deadline. Exceeding a bound fails
explicitly; page size never samples aggregation input. Repository transactions
also have the existing 30-second database timeout.

All reads, analysis and exports serialize against the same owner lock as writes;
a multi-source read observes one coherent saved revision set. Source changes
invalidate continuation cursors. Reads/analysis/export do not process pending
captures or wait for editor drafts. Owner, Trash and selected-conversation source
restrictions apply to metadata/content/query/export tool execution, including
direct and scoped execution.

## Analysis grammar

The actual advertised schemas come from `record-query.ts`. The agent-facing
`record-notes/queries.md` reference documents predicates, expressions, rounding,
units, missing/mismatched semantics, grouping and pagination with diverse examples.

Sources explicitly map logical names to stable column IDs. All sources must map
the same logical fields to compatible types/units; no names are inferred. Filters
support nested AND/OR/NOT, typed comparisons, exact case-sensitive text matching,
membership and absence checks. Missing/mismatched typed predicates yield unknown;
NOT does not convert unknown into a match. Only true matches. Exclusion diagnostics
count rejected rows containing evaluated missing/mismatched predicates and may
overlap; ordinary predicate exclusions contain neither.

Aggregates are count, sum, average, min and max, with several named results per
snapshot. Empty count is zero; other empty aggregates are null. Arithmetic uses
scaled integers, avoiding floating-point artifacts. Multiplication/division and
averages round half away from zero at 12 fractional places. Addition/subtraction
require equal unit powers; multiplication/division combine/cancel explicit unit
powers. Overflow, invalid operands, incompatible units and division by zero fail.
Derived expressions reference earlier metric names, never arbitrary code.

Grouping supports typed keys and day/week/month/year buckets. Datetime buckets
require an explicit IANA timezone; weeks start Monday. Absent/mismatched grouping
keys are excluded and reported. Group sorts reference grouping keys or named
metrics and happen after complete aggregation. Raw sort ties use source ID, saved
position and row ID. Missing/untyped results sort last. Cursors bind the full query
and all selected source revisions.

## CSV and assistant integration

CSV uses UTF-8, comma separators, CRLF record separators and standard quoting for
commas, quotes and embedded newlines. It preserves Unicode, zero, false, absent
cells and original mismatched input. Typed numbers/dates/datetimes/booleans use
locale-independent serialization. Headers-only tables export their headers.

Tool exports return a signed 15-minute capability scoped to owner, note and saved
revision, after successful serialization. The download uses the same serializer
and ownership/Trash checks. A changed revision or expired grant requires another
export. Links work without a messaging recipient's browser having a web session;
creating a link remains a non-read-only tool capability. Source restrictions are
checked before granting it.

The production `record-notes` skill exposes nine focused registered tools. Schema
and content reads are separate; add/update/delete each have an atomic batch tool.
Discovery indexes descriptions and column labels with note titles/paths, never
cell contents. Bounded inventories include note format and explicit truncation.
No business classifier, required daily capture, fixed date interpretation or
preference for itemized versus summary sources is introduced.

Automatic format selection is model judgment rather than a backend classifier.
The current model can still choose a diary destination or import historical data
without a request when existing diary context is present. Typed storage and
protected writes do not enforce that semantic choice.

## Verification

Run the automated regression checks from the repository root:

```sh
bun run --cwd apps/backend test --maxWorkers=1
RECORD_NOTES_DB_TEST=1 bun run --cwd apps/backend test --runInBand test/record-notes
bun run --cwd apps/backend check-types
bun run --cwd apps/frontend test:e2e --config playwright.records.config.ts
bun run --cwd apps/frontend check-types
bun run --cwd apps/frontend lint
```

The PostgreSQL suite uses disposable owners. Browser tests require the running
development stack and a seeded demo account, overridable with `RECORDS_EMAIL`
and `RECORDS_PASSWORD`; cleanup targets only notes created by the tests.
