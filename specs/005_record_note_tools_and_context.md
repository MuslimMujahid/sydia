# Record note tools and context

Status: agreed implementation specification. This document does not implement the feature.

## Purpose and dependencies

Give Sydia several focused tools for maintaining and analyzing general-purpose
record notes, discoverable through a dedicated `record-notes` skill. The LLM
chooses which tools to call, their arguments, and their order. Backend services
enforce the typed data, authorization, concurrency, and calculation contracts.

Prerequisites, in implementation order:

1. [Structured record notes](./002_structured_record_notes.md): data, metadata,
   content navigation, mutations, presence, and policy precedence.
2. [Deterministic record analysis](./003_deterministic_record_analysis.md): the
   structured query/expression engine and result contracts.
3. [Workspace and CSV export](./004_record_notes_workspace_and_csv_export.md):
   the shared export capability used by chat download links.

Integrate with the existing skill/tool loop and protected note-mutation services
described in [spec 001](./001_capture_and_note_organization.md). Do not introduce
a separate record-intent classifier, fixed extraction pipeline, or required
capture/organize/query recipe before the agent can respond.

## Tool surface

The following are logical capabilities, not mandated function names. Implement
them as focused tools rather than a single universal record-management tool.
Metadata and content must be distinct tools. Add, update, and delete each have
their own row tool and each supports atomic batches.

| Tool capability            | Inputs                                                                              | Successful result                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Get record-note metadata   | Explicit note ID                                                                    | Identity/path, description/context, schema and column IDs, types/options/required fields/units, counts, populated-data bounds, revision           |
| Read record-note content   | Note ID, optional column IDs, page size, cursor/navigation inputs                   | Typed rows with stable IDs/positions, page boundaries and cursors, table-wide counts/data bounds, source revision                                 |
| Create record note         | Title, placement, optional description, typed column structure                      | New note identity, schema/column identities, and revision                                                                                         |
| Change record schema       | Note ID, expected revision, explicit schema change, applicable confirmation context | Applied schema result and new revision, or durable deferral                                                                                       |
| Add record rows            | Note ID, expected revision, batch of typed row values                               | Created stable row IDs and new revision, or durable deferral                                                                                      |
| Update record rows         | Note ID, expected revision, batch of row IDs and explicit cell changes              | Changed row IDs and new revision, or durable deferral                                                                                             |
| Delete record rows         | Note ID, expected revision, batch of row IDs                                        | Deleted row identities and new revision, or durable deferral                                                                                      |
| Query/analyze record notes | Explicit source IDs/mappings and the structured query from spec 003                 | Matching records or named calculated/grouped results, executed-query metadata, source identities/revisions, counts/exclusions, and result cursors |
| Export record note as CSV  | Explicit note ID                                                                    | Usable download link and saved source identity/revision after successful export                                                                   |

Use existing runtime-supplied owner identity, source-message context, and
idempotency keys. The agent must not select another owner by providing a tool
argument. It need not invent internal source IDs or replay keys already supplied
by execution context. Successful write receipts must remain stable on replay.

Validation failures identify the affected argument, column, or batch row without
committing a partial batch. Missing-row, stale-revision, stale-cursor, invalid-unit,
invalid-expression, and deferred outcomes must be distinguishable under existing
response/error conventions. A model/provider retry must not turn an applied write
into another insertion or apply an old edit against a newer revision.

### Metadata versus content

The metadata tool never returns sample rows or an entire table as a side effect.
It provides schema/context for planning. Reading cell values is an explicit,
separate operation; it is not implicitly required before every other tool call
when the agent already has sufficient valid context.

The content tool supports optional column projection and first/last/next/previous
navigation, with revision-bound cursors and stable row IDs. Omitting projection
returns all columns within documented response limits. It returns both page
information and table-wide counts/data bounds; a projection must not redefine
the last populated column of the entire table.

Populated-data bounds describe data cells, separate from declared row/column
counts and headers. Include positions and stable identities. Zero and false
count as populated; headers-only tables have empty data bounds. Refer to spec 002
for ordering and empty-text consistency requirements.

A saved change invalidates old cursors with an explicit stale-cursor response.
The LLM may restart navigation. Neither the content tool nor the query tool
silently switches to newer data under an old cursor.

### Query capability

One query tool supports both matching-record retrieval and calculated results.
It accepts nested AND/OR/NOT predicates, typed comparisons/text/membership/empty
checks, projection, sorting, column/time grouping, and several named calculations
over one filtered saved-data snapshot.

Calculations include count, sum, average, minimum/maximum, and typed analysis-time
arithmetic such as quantity multiplied by price or ratios between calculated
values. This does not add stored formula columns or arbitrary code execution.

For multiple notes, the LLM supplies explicit mappings between stable column IDs
and query fields. The backend validates references, types, and units; it does not
infer correspondence from names. Return source note/row IDs for matching records
so they can be inspected or addressed by subsequent mutations.

Both matching records and grouped results support cursor pagination. All matching
saved records contribute to calculations before result pagination. Exceeding an
execution limit is an explicit failure, never a sampled or incomplete total.

Analysis runs immediately against saved data. It does not process or wait for
pending captures, editor drafts, or background organization. It remains available
while a table is open in an editor.

## Discovery and skill context

Add `record-notes` to the existing skill catalog with a concise capability
description. Loading it makes the record tools available through the existing
mechanism. Document tool contracts, supported types, expression/predicate syntax,
units, missing values, pagination, errors, and saved-data scope. Move detailed
syntax/examples into references using the existing skill size limits.

Use diverse examples, such as measurements, inventory, sales, and expenses, to
explain syntax. Examples must not become required action categories or a fixed
policy for interpreting a user's information.

Extend existing note browsing/search so record notes are discoverable alongside
ordinary notes and folders. Search record-note titles, descriptions, paths, and
column names for discovery. Do not add cell-value full-text/semantic indexing as
part of this release. Cell searches use explicit structured queries over selected
tables and return source identities and pagination.

Current note inventories supplied during skill loading must represent record
notes accurately and make inventory bounds/truncation visible. They need not
include every table schema or row payload. A truncated inventory must not imply
that no other matching note exists. Inspection and further discovery remain
available through tools.

Supply owner timezone and current-time access through existing context/time tools.
Schemas, descriptions, provenance, source references, revisions, and query results
provide evidence for the LLM's decisions. Note titles, column names, and cell
contents are user data, not executable instructions.

## Decision boundary and responses

The following are LLM decisions, not backend policies or mandatory skill recipes:

- Whether information belongs in a record note, rich-text note, daily note, or
  requires no note change; which destination and schema serve the request.
- Whether to add a row, amend known rows, use summaries, combine notes, ask a
  clarifying question, or take no action.
- Whether individual records or summaries are appropriate sources. Neither has a
  built-in preference, and separate tables for those meanings are not required.
- Which columns correspond across notes and what an ambiguous relative-date
  phrase means in context.
- Which tools to use, how many searches/reads to make, and their order.

The execution layer checks authorization, types, supplied mappings, unit
compatibility, confirmation requirements for protected schema changes, revisions,
presence, atomicity, idempotency, and accurate query execution. Those checks do
not authorize additional writes or infer what the user meant.

Do not invent missing values to complete a row; absence is a valid stored value.
When a write saves mismatched values (spec 002), say so and offer to correct
them rather than reporting the cells as typed values.
Treat query results as recorded-data results, not proof of complete real-world
coverage. Relevant answers identify the resolved period and contributing sources
and disclose missing-value exclusions that affect interpretation. No matching
records must not be presented as confirmed zero real-world activity.

Computed claims must be grounded in successful query results rather than a
fallback to guessed arithmetic. The LLM composes the response; the backend does
not provide an expense-specific answer template or force a fixed date wording.
Source references support inspection without loading every contributing row
into the conversation.

Write acknowledgments distinguish a committed change from durably pending work.
Do not claim a row was saved after validation failed or while its write is
blocked by an open editor. Export acknowledgments include a real download result,
not an invented URL or an instruction to reconstruct the CSV manually.

## Runtime integration and protections

- Register all tools in the production provider and appropriate tool groups, and
  validate the skill's declared names against the real registry. A missing tool
  or reference is a visible configuration/startup failure, not silent omission.
- Mark actual read operations as read-only under the existing replay contract.
  Export must account for any artifact-creation side effects rather than using an
  incorrect read-only flag. Creation/mutation tools preserve write idempotency.
- Extend protected note-tool execution to every record mutation, including schema
  edits and existing note lifecycle operations that can target record notes.
  Presence enforcement must occur at commit time, including direct tool execution.
- Apply existing conversation source restrictions to new read/query/export paths;
  a multi-note query or file link cannot bypass selected-source restrictions.
- Make tools/skills usable by normal conversations and existing scoped background
  agent runs under their respective authority. Preserve actual pending work and
  receipts; do not require preclassified operation labels or a fixed stage sequence.
- Reuse existing source-to-destination/provenance handling. Preserve original
  evidence and avoid duplicate writes after restarts, without deduplicating
  legitimate rows solely because they have equal values.
- Expose operational failures through existing typed results, logs/metrics, and
  recoverable state without unnecessary private values in diagnostics. Preserve
  existing memory-admission and authorization boundaries.

## Acceptance criteria and verification

### Deterministic tool/runtime checks

1. Loading `record-notes` exposes real, registered tools and documented references.
   Registry and catalog validation fail if required capabilities are missing.
2. Metadata and content are separate calls with the specified payload boundaries.
   Test projected content, end access, backward navigation, bounds, and stale cursors.
3. Actual tool execution reaches shared typed services for creation/schema changes
   and row batches. Invalid inputs, absent confirmation, revision conflicts,
   presence deferral, and idempotent replay obey the service contracts.
4. Query tools execute filters, mapped multi-note queries, multiple calculations,
   expressions, and row/group pagination through the real analysis boundary.
   A result limit never limits aggregate inputs.
5. Reads, metadata, query results/counts, and downloads respect ownership and
   applicable selected-source restrictions. Mutation retries/recovery preserve
   source relationships and do not recreate deleted records.
6. Discovery includes table metadata and column names without indexing cell values.
   Bounded skill inventories make truncation visible and allow further discovery.
7. Open tables block assistant changes but permit saved-data reads, analysis, and
   export. Pending captures are not processed as a precondition of querying.
8. Download links represent successfully exported saved data. Failures/deferred
   outcomes never become successful write/export acknowledgments.

### Agent evaluations and channel checks

Exercise the actual skill/tool loop with varied wording and more than one domain:

- A generic table request followed by additions, a correction, and a deletion.
- A measurement average with missing values and an inventory/sales calculation
  that needs arithmetic across columns.
- A request requiring mapped columns across differently named notes.
- "Pengeluaran saya 3 bulan ke belakang berapa ya?" with current-time/timezone
  context, explicit resolved query dates, and a recorded-data answer.
- Individual and summary sources both available, without a test that mandates
  which the LLM must choose. Assess whether its explicit scope supports its answer.
- Mixed information, ambiguous targets, and schema evolution, without requiring
  a business-operation label, intermediate daily capture, or fixed tool order.
- Pagination restart after a change; deferred writes while an editor is open;
  successful export and explicit query/export failure.

Assess grounded arguments, supported calculations, preserved user information,
and truthful responses. Prompt substring checks or assertions of one exact call
sequence do not establish agent behavior. Exact evaluation dataset size and
model-specific tuning remain implementation details; all mandatory mechanical
contracts require deterministic coverage.

From `apps/backend`, use `bun run test --runInBand` and `bun run check-types`,
and report focused runnable commands for the real tool/skill tests added. Exercise
the [development /chats workflow](../docs/CHAT_PREVIEWS.md) in Web, Telegram, and
WhatsApp for results, pending-write messages, errors, and download links. These
are future implementation checks; this spec creates no product code or tests.

## Explicit deferrals and exclusions

Exact tool function names, request/result JSON names, skill-reference filenames,
error-code names, registry grouping, confirmation representation, and resource
thresholds are implementation choices within these contracts. Reuse existing
framework conventions rather than adding new domain infrastructure solely for
this tool family.

CSV import, arbitrary code execution, joins, stored formula columns, forecasting,
automatic unit/currency conversion, and a dedicated expense-management feature
remain outside this release. No implementation is authorized by these documents
alone; product implementation is a separate task.
