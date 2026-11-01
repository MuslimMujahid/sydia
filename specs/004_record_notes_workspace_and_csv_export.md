# Record notes workspace and CSV export

Status: agreed implementation specification. This document does not implement the feature.

## Purpose and dependencies

Let users create, inspect, and edit typed record notes in the existing Notes
workspace, and download their saved data as CSV. The primary editor task is to
maintain records, with the same data and validation used by assistant tools.

Prerequisite: [structured record notes](./002_structured_record_notes.md).
CSV export implemented here is also exposed through
[agent tools](./005_record_note_tools_and_context.md).
[Deterministic analysis](./003_deterministic_record_analysis.md) is an agent
capability; this specification does not require a separate analytics interface.

## Workspace behavior

Record notes appear alongside existing notes and folders and use existing
navigation, ownership, placement, and lifecycle conventions. Preserve the current
rich-text and daily-note editors. Dispatch rendering according to the actual note
representation instead of attempting to load record data as a Tiptap document.

Users can:

- Create a record note with a title and a typed column structure.
- Open an existing record note and inspect its columns and saved rows.
- Add, edit, clear values, and delete rows.
- Manage column names, types, order, units/currencies, and single-choice
  definitions through the supported schema contract.
- Download the saved table as CSV.

No expense-specific fields, accounting terminology, automatic category assignment,
or required transaction/summary distinction is part of this interface. A record
note can have whatever schema the user or LLM chooses within supported types.

Use the same backend mutations and interpretation rules for editor and assistant
writes. For example, an absent boolean must remain distinguishable from false, and
an absent number must not become zero merely because a form rendered an empty
input.

Cells accept any input, matching spreadsheet behavior. Input that does not match
the column type is saved as a mismatched value (spec 002) with its original text
preserved; it is not blocked or coerced. Display a mismatched value as entered,
with a non-color-only indicator and an accessible description that states it does
not match the column type.

Initial creation and column addition do not require an extra approval workflow.
Schema changes follow the proportionate editor model in spec 002, without a
modal confirmation step for reversible changes:

- Rename a column inline in its header. Enter saves and Esc cancels.
- Change a type from a type list in the column menu. Every supported type can be
  selected, and selecting one applies the change immediately. Values that do not
  match the new type become mismatched values rather than blocking the change.
- Rename and type changes remain undoable through the editor's undo control and
  keyboard shortcut. Undo/redo itself does not show a success toast.
- Removing a column requires an inline confirmation within the column menu that
  names the column and explains that its values will be deleted and can be
  restored through undo. After successful removal, show a toast naming the column
  and offering Urungkan. Closing the toast does not remove the open editor's
  undo/redo history. Restoration covers values across all saved pages.

Schema changes other than an explicitly confirmed column removal must not
coerce or delete cell data.

## Reading and editing the table

Load schema/context separately from row data. Use bounded row loading consistent
with the cursor contract in spec 002; the browser must not require the entire
dataset before presenting an editable table. UI navigation can choose suitable
controls without exposing cursor tokens or backend identifiers to ordinary users.

Retain stable row/column identities across renders and edits. Visible positions
must correspond to the saved ordering used by content tools. Large or wide tables
must remain navigable without hiding column identity or making primary actions
unreachable. Exact virtualization, paging controls, and detailed visual layout
are implementation choices.

Show the information needed to edit records: note identity, column labels, values,
relevant type/unit constraints, and save/validation state. Do not display every
backend count, cursor, revision, or provenance field simply because it exists.
Additional schema controls can use proportionate disclosure; ordinary edits should
not require a multi-step setup flow or a new dashboard.

Controls and table cells must have meaningful accessible names and visible focus.
Keyboard users can reach and operate creation, editing, row deletion, schema
management, pagination, and export. Errors must be associated with affected inputs;
loading, failure, and save state cannot rely solely on color or transient toasts.
Compact layouts retain access to the same primary tasks.

## Editor presence and conflicts

Extend the shared presence contract from spec 001 to every surface that presents
a record note as editable, including the Notes workspace and any existing chat
note surface that opens that note. Do not declare an editor ready before its
presence registration and current saved version are established.

While any tab/device has the table open, assistant mutations wait durably. A user
can still save manual edits. Closing one editor releases only that editor's lease.
On navigation/close, flush pending saves before releasing protection. Failed saves
retain the draft and protection according to the existing contract.

If a revision conflict or expired lease prevents a safe save, preserve local
changes and expose a recoverable conflict. Do not replace current server data with
a stale whole-table draft or silently discard the draft. Reads, analysis, and
export remain available against saved records while the table is open.

Empty, loading, unavailable, validation-failure, and conflict states must be
distinguishable and proportionate to the editing task. A failed load is not an
empty table. Failed saves must not appear as successful commits.

## CSV export contract

Export is available through a workspace download action and through the agent's
export tool. Both paths use the same backend serialization and authorization
contract. Export does not mutate the source note and is permitted while it is
open in an editor.

The release exports a complete saved table, with current column headers in saved
order and saved rows in table order. Exporting a filtered query result is not
required. Unsaved drafts and pending captures are outside the export; the UI and
tool result must identify the saved-data scope when it matters to the request.

The exporter must:

- Produce valid CSV with correct quoting/escaping for separators, quotes, and
  embedded newlines, and preserve Unicode text such as Indonesian descriptions.
- Preserve valid zero/false values and represent missing cells without inventing
  data. Export mismatched values as their original input text. Use documented, consistent serialization for dates, date-times, numbers,
  booleans, and choices, independent of the server's ambient locale/timezone.
- Include headers for a saved table with no rows. CSV does not need to carry the
  database's full type schema, internal row IDs, or source provenance.
- Read a coherent saved version, rather than mixing rows from different revisions
  while producing a large file. Record the exported source identity and revision.
- Apply existing owner authorization and applicable source restrictions. A chat
  download link must not become an unrestricted way to access another owner's
  notes. Use existing authenticated/download infrastructure where appropriate.
- Return a usable download result only after the export succeeds. Failed file
  creation or unavailable storage is an explicit, observable failure, not an empty
  CSV, fabricated link, or successful export acknowledgment.

The agent can return the download link in Web chat, Telegram, and WhatsApp using
existing response/link handling. This feature does not require new external
delivery integrations. Exact endpoint names, artifact storage, filename rules,
expiry, and serialization details are implementation choices that must satisfy
the download/access and data-preservation contracts.

CSV import is excluded. No import button, column-mapping wizard, or historical
backfill is required. CSV is an interchange output; the database remains the
authoritative record representation after export.

## Acceptance criteria and verification

1. Create a generic measurement table, save rows of supported types, reopen it,
   and observe the same values. Repeat with a sales or inventory schema without
   financial fields being injected by the interface.
2. Manual edits and assistant mutations interpret the same input identically.
   Mismatched input is saved with its original text and an accessible indicator;
   absence, zero, and false remain distinct after saving and reloading.
3. Row editing/deletion targets stable identities across page navigation and
   saved changes. Opening a large table does not require loading all row content.
4. Rename inline and change types from the column menu without a modal. Renames
   preserve data identities; any type can be selected and non-matching values
   become mismatched values without data loss. Undo is reachable by keyboard and
   applies against the current revision. Column removal requires an inline
   confirmation naming the column and stating that its values will be deleted.
5. Two tabs/devices, navigation with unsaved changes, lease expiry, and concurrent
   assistant planning follow the existing presence and conflict contract. A
   failed save neither loses the draft nor silently releases its protection.
6. Primary actions, inputs, errors, and navigation work using a keyboard. Verify
   accessible names/focus and usability at wide and compact viewport sizes.
7. Export a table containing commas, quotes, newlines, Unicode, missing values,
   zero, false, dates, and date-times. Independently parse the downloaded file and
   compare values and column/row ordering with the saved revision.
8. A headers-only table exports correctly. An unsaved draft is not silently
   represented as saved/exported data. Concurrent saves cannot produce a file
   containing mixed source revisions.
9. The editor and chat export paths share serialization and access behavior.
   Unauthorized download attempts fail, and export failures do not produce a
   successful download result. Verify links through all three chat previews.
10. Existing rich-text, daily-note, folder, and Trash journeys continue working.

Use real browser tests for editing, focus, download behavior, and presence across
tabs; service/integration tests cover serialization, ownership, and consistency.
Expected CSV contents must be derived independently rather than generated by the
serializer being tested.

From `apps/frontend`, run `bun run test:e2e`, `bun run check-types`, and
`bun run lint`, with targeted Playwright commands reported for the actual new
tests. Backend export tests use the existing backend Jest setup. Follow
[the /chats preview workflow](../docs/CHAT_PREVIEWS.md) with development frontend
and backend (`NODE_ENV=development`) for Web, Telegram, and WhatsApp responses.
These checks are obligations for implementation, not tests run for this spec.

## Explicit implementation deferrals

Detailed visual design, save buffering strategy, form presentation, table
component/virtualization choice, precise responsive layout, and download plumbing
are deferred. Reuse the existing TanStack, Axios, Query, component, and backend
response patterns and the applicable frontend/backend AGENTS.md guides. No new
framework or package is mandated by this specification.
