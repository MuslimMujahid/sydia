# Deterministic record analysis

Status: agreed implementation specification. This document does not implement the feature.

## Purpose and dependencies

Provide a structured query capability that reads saved record notes and returns
matching rows or backend-calculated results. The LLM translates a request into
explicit query arguments and explains the result; calculations are executed by
the backend rather than estimated from text in the conversation.

Prerequisite: [structured record notes](./002_structured_record_notes.md).
[Agent tools and context](./005_record_note_tools_and_context.md) expose this
capability to Sydia. No frontend analytics dashboard is required.

This is a general-purpose query engine. It must not contain expense-specific
categories, accounting rules, transaction/summary classifiers, or a preference
for particular source types.

## Query execution boundary

- Execute against saved records immediately. Do not trigger, process, or wait for
  pending captures or background organization before answering a query.
- An open editor does not block analysis. Unsaved editor drafts and pending
  assistant writes are not part of the queried dataset.
- Each execution observes a consistent saved-data snapshot across its selected
  sources. Return the source identities, revisions, and execution time needed to
  describe that scope. This does not require retaining historical snapshots for
  subsequent page requests.
- The LLM chooses source notes, column correspondences, filters, date intervals,
  grouping, expressions, and calculations. The backend validates supplied
  arguments and executes them; it does not infer business meaning.
- Natural-language dates are not query parameters. The LLM receives current-time
  and owner-timezone context and supplies explicit dates/instants and relevant
  timezone/grouping settings. There is no fixed interpretation of phrases such
  as "3 bulan ke belakang" in backend logic or mandatory skill guidance.
- Preserve owner isolation, Trash behavior, and existing conversation source
  restrictions for every selected source, including multi-note queries.

## Logical query contract

Exact JSON field names and grammar are implementation details. The public
contract must be structured, validated, and documented for these capabilities:

| Query part        | Required capability                                                               |
| ----------------- | --------------------------------------------------------------------------------- |
| Sources           | One or more explicit record-note IDs; retain their identities in results          |
| Field mapping     | Explicit mappings from each source's stable column IDs to query field names       |
| Filters           | Nested AND, OR, and NOT with type-appropriate predicates                          |
| Row selection     | Projection of selected fields, sorting, and cursor-paginated matching records     |
| Grouping          | Group by columns and by explicit time periods with applicable timezone settings   |
| Calculations      | Count, sum, average, minimum, maximum, and several named calculations in one call |
| Expressions       | Limited typed arithmetic over numeric fields and calculated results               |
| Result navigation | Cursor pagination for returned records and grouped results                        |

Predicates include equality/inequality, ordering/range comparisons where the type
supports them, text matching, membership, and empty-value checks. Operators must
be validated against the referenced type. The documented grammar must define
boundary inclusivity, text-comparison behavior, and absent-value behavior so the
same explicit query always has the same meaning.

For example, the agent can request a date interval AND (location A OR location B),
or exclude rows matching a boolean condition. The backend executes the supplied
predicate tree, without converting it into a natural-language interpretation.

### Combining notes

The LLM provides explicit field mappings, for example mapping column `Tanggal`
from one note and `Date` from another to a query field. The backend validates
that referenced columns exist and that their types and units support the query.
It must not infer column correspondences from labels.

Combining notes means combining mapped records for filtering and calculation,
not joining unrelated tables. Results retain source note and row identities.
Incompatible mappings fail explicitly; missing columns are not silently filled
with zero or guessed values.

Source meaning, possible overlap, and whether individual records or summaries
serve the user's question are LLM decisions. Provide schemas, descriptions,
provenance, and query results to support those decisions. Do not automatically
classify rows, remove equal-valued records, or select a preferred source type.
Existing idempotency/provenance guarantees still prevent replaying the same write.

### Analysis-time expressions

Support a limited typed expression format for arithmetic, such as multiplication
of quantity by unit price, differences, and ratios/percentages between calculated
values. Expressions can be used within a calculation or to derive a returned
calculated value. Multiple calculations over the same filtered dataset execute
within the same saved-data snapshot.

This capability does not create persistent formula columns. It does not expose
SQL text, arbitrary JavaScript/Python, filesystem access, network access, or
unbounded executable code.

Validate references, operand types, units, expression shape, and execution bounds.
Reject unsupported expressions, incompatible arithmetic, division by zero, and
numeric overflow explicitly. Do not substitute a default number or silently
discard a failed calculation. Document numeric precision and rounding behavior;
the representation must avoid introducing spurious floating-point artifacts into
ordinary decimal arithmetic. Expression grammar, supported precision, and exact
rounding settings are implementation choices within these reliability constraints.

### Missing values and units

Optional missing values remain distinguishable from valid zero/false values.
Counts must distinguish matched rows from values contributing to a calculation.
For each relevant calculation, expose contribution and missing-value information.

A date-filtered result must identify relevant rows excluded for missing dates.
More generally, missing-value exclusion metadata must distinguish absence-related
exclusions from ordinary predicate mismatches. Its definition for nested filters
must be documented; it must not claim knowledge of records never saved.

For an average over values 0, 10, and an absent value, the result is 5, with two
contributing values and one missing value. An empty match is distinguishable from
a dataset containing a genuine zero. It does not prove that no real-world activity
occurred. Document empty-input behavior for every aggregate.

Mismatched values (spec 002) never contribute to typed predicates, grouping, or
calculations, and are never converted to a number, date, or boolean. Report them
separately from absent values in contribution and exclusion metadata, so a result
can state, for example, two contributing values, one missing, and one mismatched.

No automatic unit or currency conversion is included. Calculations must not
silently merge incompatible units. The LLM may request separate results for
different units/currencies; each result retains its unit information. Arithmetic
expressions must obey the documented unit-validation contract rather than guess
an exchange rate or reinterpret a value.

## Results, completeness, and pagination

Return a validated/resolved representation of the executed query, source note
IDs/revisions, relevant explicit date bounds/timezone, calculation definitions,
units, matched/contributing/excluded counts, and result data. Matching-record
results include stable source note and row IDs so the agent can inspect or edit
them. Grouped results identify their grouping keys and named calculations.

Raw-row and aggregate results are explicit result shapes. The agent can query
matching records without an aggregate, or retrieve records behind an aggregate
using the corresponding explicit filters. It need not navigate every unfiltered
table page first. Do not enforce a mandatory tool sequence.

Filtering and calculations cover all matching saved records before paginating
the returned result. Sorting or limiting returned groups must not limit the
source records included in an aggregate. A page size is never a sampling budget.

Record and grouped-result cursors are bound to the selected source revisions
and the query, including mappings, filters, expressions, and ordering. Changed
source data/schema invalidates the cursor with an explicit stale-cursor response.
The agent can restart the query; mixed-version continuation is not permitted.
Stable ordering, including tie handling, must prevent omissions or repeats while
the source revisions remain unchanged.

Timeouts, expression limits, unavailable sources, and other resource failures
return typed, observable failures. Do not return a partial total as success,
silently omit an unavailable selected note, replace failure with an empty match,
or fall back to LLM arithmetic. Exact execution limits and cursor internals are
deferred, but must be documented and covered by tests.

## Acceptance criteria and verification

Use independently calculated expected results and deterministic clock/timezone
fixtures. Verify the actual query execution boundary, including database behavior
where needed, rather than only argument parsing or mocked arithmetic.

| Scenario                                                  | Observable outcome                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Values 100, 150, and missing                              | Sum 250; average 125; three rows, two contributing values, one missing value             |
| Values 0, 10, and missing                                 | Average 5; zero contributes and missing does not become zero                             |
| Quantities/prices (2, 12.5) and (3, 4)                    | Sum of quantity multiplied by price is 37                                                |
| Ratio 1 divided by 4, expressed as a percentage           | Backend result is 25 percent under the documented expression contract                    |
| Several metrics grouped by month                          | Every metric uses the same filtered dataset and source snapshot                          |
| Nested date and OR/NOT predicates                         | Only records satisfying the explicit predicate tree contribute                           |
| Two mapped notes with different labels                    | Valid supplied mappings combine records; undeclared correspondences are not guessed      |
| Incompatible units or invalid expression                  | Explicit failure; no guessed conversion, zero, or partial calculation                    |
| Missing dates, empty matches, and genuine zeros           | Results distinguish these states and disclose applicable exclusions                      |
| Matching rows without aggregation                         | Sorted/projection results contain stable source note and row IDs                         |
| More result groups than page size                         | Cursor pages cover the result; every group's calculation covers all matching source rows |
| Source changes between result pages                       | Old cursor fails explicitly, even when only one of several sources changed               |
| Pending capture and unsaved editor changes exist          | Query runs immediately against saved records without processing either                   |
| Dataset exceeds an execution bound                        | Typed failure rather than a sampled or truncated aggregate                               |
| Unauthorized or disallowed source in a multi-note request | No unauthorized data contributes or leaks through counts or metadata                     |

Exercise these contracts across more than financial fixtures, including sales,
inventory observations, and measurements. LLM evaluations must assess grounded
query arguments and answers without requiring a fixed source-selection policy
or interpretation of ambiguous date phrases.

From `apps/backend`, use `bun run test --runInBand` and `bun run check-types`.
Implementation changes must supply focused runnable commands for their actual
analysis test files, plus integration checks for cursor and snapshot guarantees.
Tests and commands are implementation obligations, not work performed by this
documentation change.

## Deferred implementation details

Choose the JSON grammar, supported numeric precision, predicate comparison rules,
expression evaluator, database query plan, snapshot mechanism, time-bucket API,
resource limits, and result-cursor encoding during implementation. Document their
exact semantics and test the agreed capabilities before exposing them to the LLM.

This release excludes forecasting, joins, stored formula columns, automatic
currency/unit conversion, and arbitrary code execution. It adds no requirement
to reconcile unsaved or pending records before querying saved data.
