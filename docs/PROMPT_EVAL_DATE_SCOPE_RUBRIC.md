# Date attribution acceptance rule

The owner clarified this rule on 9 November 2026: an answer may include older rows
as additional context and still pass when it correctly identifies the requested
day's rows. Mentioning a row outside the requested period is not itself a failure.

Accept an answer when:

- It includes the required rows for the requested day with correct date attribution.
- Additional rows are distinguishable by dates, a historical heading, or an explicit
  statement that they are outside the requested period.
- Any claimed total for the requested period excludes those additional rows.

Reject an answer when it omits required rows, assigns another day's rows to the
requested day, gives an incorrect requested-period total, or mixes rows so that
the requested day's result cannot be identified. Explicitly excluding a row from
a requested-period total is acceptable.

This supersedes the interpretation that every mention of an out-of-period row
is a product defect. The old automatic `notContains` checks cannot distinguish
historical context from incorrect attribution; their scores remain the legacy
scorecard. Removing those checks without replacing the attribution requirement
would also be insufficient.

The six saved comparison suites were reviewed against this revised rule without
new model calls. Nine pre-change samples and four final samples previously rejected
only for mentioning other dates now pass. Revised scores are 421/441 pre-change
and 439/441 final. The final version's remaining two failed samples are a pickup
detail omission and the unchanged language heuristic's false positive. No language
check correction was applied in this review.

The [reviewed scorecard](../apps/backend/test/prompt-eval/results/reliability-repeat-2026-11-09/date-scope-reviewed-v2.md)
records each accepted sample, its original text hash, the original and reviewed
scores, and the review rationale. That manual review is retained as historical
evidence, not evidence that either model implementation improved.

## Automatic scores

The subsequent `date-attribution-v2` checker now applies this rule in the live
scenarios and offline replay. It checks required rows, date/heading attribution,
explicit IDR totals and row counts. Historical sections, dated mixed-day tables
and explicit exclusions are accepted. Missing rows, undated mixed lists, wrong
requested-day attribution and mixed-period totals are rejected. Recognised forms
are ISO dates, English/Indonesian month names and temporal headings; unusual text
can still require review. This is a bounded deterministic check, not a general
semantic judge or validation of every extra row's value.

Automatic replay of every date-scoped answer reproduces the manual totals:
421/441 pre-change and 439/441 final. The stored baseline now scores 147/147.
The language check remains unchanged. Original strict-word-ban JSON and Markdown
are preserved under `results/reliability-repeat-2026-11-09/strict-word-ban-v1`;
the current individual reports and [comparison](../apps/backend/test/prompt-eval/results/reliability-repeat-2026-11-09/comparison.md)
carry the automatic v2 scores. Source hashes, outputs, tool calls and usage remain
available. The replay uses original fixture dates rather than today's date.

Regression tests verify accepted history and rejected misattribution/totals.
Temporarily restoring the word ban makes the historical-context acceptance test
fail, confirming it distinguishes the old and new rule. Replay tests cover
unchanged unrelated failures, historical date boundaries, original input
preservation and idempotent scoring. See the prompt-eval README for commands.
