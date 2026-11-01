# Table contracts

create_record_note: {title,parentId:null|folderId,description,columns:[{id,name,type,required:false,unit?,options?}]}.
Types: text, number, date, datetime, boolean, choice. Choose column IDs once.
Text is preserved; booleans accept true/false; dates YYYY-MM-DD; datetime ISO with
Z or offset. Numbers accept up to 18 integral and 12 fractional digits, no separators
or guessed currency conversion. Unit is a single numeric column unit/currency.
Choice options are unique nonempty strings. Unknown input remains raw mismatched
text. null clears a cell; omitting it leaves the old value untouched. Empty string
is saved (typed for text); empty text does not count toward populated bounds.

Metadata {id} returns schema, context, revision, counts, mismatch counts, global
bounds and path, never rows. Content {id,limit:1..200,columns?,navigation?:first|last,
cursor?} returns stable row IDs, persistent 1-based saved positions and typed/raw
cells. Positions are monotonically assigned and may have gaps after deletion.
Columns are in saved array order. Bounds use stable IDs and positions; zero and
false are populated. Empty table bounds are null. Projection never changes global
bounds. Use returned next/previous cursors; last jumps directly to the end. Cursors
bind owner, note, revision, page size and projection. Changes cause STALE_CURSOR.

add_record_rows {id,revision,batch:{rows:[{values:{columnId:input}}]}}.
update_record_rows {id,revision,batch:{rows:[{id:rowId,values:{columnId:input|null}}]}}.
delete_record_rows {id,revision,batch:{ids:[rowId]}}.
Max 200 changes per atomic batch. Optional beforeId/afterId on add batches inserts around a saved stable row ID; omit both to append. Runtime supplies source evidence and replay key;
do not supply an owner, idempotency key or invented provenance. Equal values do not
deduplicate. A missing row or invalid column aborts the entire batch.

change_record_schema {id,revision,columns:[full ordered definitions],confirmed?}.
Keep IDs of existing columns. New optional columns leave old rows absent. Explicit
user confirmation is required for assistant renames, removals, type/unit/options
changes. Reinterpret original input on type changes. No values are guessed or lost;
nonmatching cells become mismatched and changing back can restore typed values.

Mutations return status:committed, saved:true, revision, changedIds and mismatched
cell identities (`mismatchedCells`, up to 200, with mismatchedCount/mismatchedTruncated); or status:deferred, saved:false, workId while an editor is open.
Replay returns the durable original result. Conflicts do not apply stale edits.
Errors identify VALIDATION, UNKNOWN_COLUMN, MISSING_ROW, REVISION, LEASE_EXPIRED,
CONFIRMATION_REQUIRED, IDEMPOTENCY_MISMATCH or stale/invalid cursors. Storage errors
remain failures. Reads/analysis/export use saved data even while an editor is open.
