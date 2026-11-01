# Query grammar

query_record_notes accepts {sources:[{id,fields:{queryField:columnId}}],filter?,
select?,sort:[{field,direction:asc|desc}],groupBy:[{field,period?,timezone?}],
calculations:[{name,op,expression?}],derived:[{name,expression}],limit?,cursor?}.
Map every logical field explicitly for every source. Types, choices and units must
match. Combining sources unions records, never joins/deduplicates them.

Filters: {and:[filters]}, {or:[filters]}, {not:filter}, or
{field,op,value?}. Operators eq, ne, gt, gte, lt, lte, contains, starts_with, in,
empty, not_empty. Ordering is number/date/datetime only. Contains/starts_with are
case-sensitive text-only; equality is exact. in takes an array. Numeric comparison
values are decimal strings; boolean values are booleans. Boundaries: gte/lte are
inclusive; gt/lt exclusive. empty means absent, not empty text. Missing/mismatched
cells yield unknown for typed predicates, including under NOT. AND/OR use
three-valued logic; only true matches. Empty checks explicitly handle absence;
mismatched cells never match predicates. Exclusions count rejected rows with any
missing/mismatched evaluated predicate; these diagnostic counts can overlap.
Ordinary predicate exclusions have neither. They describe saved records only.

Expressions: {field:name}, {value:"12.5",unit?:"IDR"}, {metric:name}, or
{op:add|subtract|multiply|divide,left:expression,right:expression}.
Field expressions require numeric fields. metric references earlier calculations
or derived values and is allowed only in derived expressions. Derived expressions
cannot reference row fields. Add/subtract require identical units. Multiplication
combines unit powers; division subtracts them, cancelling identical units. No
conversion. Multiplication/division/averages round half away from zero at 12 decimal
places. Input never rounds. Overflow beyond 18 integral digits, division by zero,
invalid references or incompatible units fail explicitly, even on an empty dataset.

Aggregates count, sum, average, min, max. count without expression counts rows;
with expression it counts contributing values. Others require an expression.
Missing/mismatched operands exclude a row from that calculation, reported
separately (counts may overlap). Zero contributes. Empty count=0; empty sum/average/
min/max=null. Multiple named calculations share a saved snapshot. Results include
contributing, missing, mismatched, unit, source revisions and executed query.

Groups use typed fields or explicit day/week/month/year periods. Weeks start Monday.
Datetime periods require an IANA timezone; dates are calendar dates. Absent and
mismatched group fields are excluded and reported. Calculations cover all matching
records before result pagination. Group keys sort deterministically; raw sort ties
use source ID, saved position and row ID. Null/untyped values sort last. Group sort fields name group keys or calculated metrics; sorting applies after complete aggregation.
Page cursors bind full query and every source revision; any change requires restart.

Examples: average measurements -> average {field:"temperature"}; sales total -> sum
{op:multiply,left:{field:"quantity"},right:{field:"price"}}; inventory ratio -> derived
{op:multiply,left:{op:divide,left:{metric:"sold"},right:{metric:"received"}},right:{value:"100"}}.
Expenses over a resolved date interval -> and of gte/lt date predicates, sum amount.
These are syntax examples, not mandatory source or date interpretation policies.

Bounds: max 20 sources, 10,000 input rows, 64 fields/table, 200 results/page, 30
calculations and derived values each, nesting 16, 3,000 query nodes, five-second
execution deadline. Exceeding a bound fails, never samples or returns partial totals.
