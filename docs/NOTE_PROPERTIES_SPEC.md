# Note properties specification

Status: draft for review, 8 November 2026. Nothing here is implemented. Decisions marked **Proposed** are recommendations awaiting owner approval; [owner decisions](#owner-decisions) records what has been settled.

## Why

Custom notes carry no metadata beyond title, folder, content and timestamps (`workspace_item`). The assistant can only tell similar notes apart by title and wording, which fails for notes that form a series, such as one order note per day. Asking "buka catatan pemesanan hari ini" then depends on the date appearing in a title in a form the model can match.

Properties are typed key/value pairs on a note, in the spirit of Obsidian properties. They let the assistant and the workspace find a note by exact attributes (`tags` contains `pemesanan`, `date` is today) instead of by guessing from titles, for reads and, more importantly, for choosing where a new capture goes.

Context: the 8 November 2026 order-note session (Langfuse trace `bf709a29`). The default stays one record table with a date column. Properties matter once a user wants separate notes per day, and they are a prerequisite for the planned split/merge operation on record tables.

## Scope

In scope:

- Properties on custom notes, both `rich-text` and `record` formats.
- A per-owner property key registry that fixes each key's type.
- Structured filtering and text indexing of properties.
- Assistant tools and guidance to read, write and filter by properties.
- A properties panel in the Web notes workspace and a property filter in workspace search.

Out of scope for this version:

- Properties on daily notes (owner decision).
- Splitting or merging record tables (separate spec; it builds on this one).
- Grouped or board views of the workspace by property (see [Web workspace](#web-workspace) for the ordering that covers the per-day case instead).
- Properties on folders.

## Data model

### Property values

**Proposed:** store properties in a new `properties jsonb not null default '{}'` column on `workspace_item`, keyed by the normalized key. They are not stored inside the Tiptap document or as YAML frontmatter, so the editor, `richTextToMarkedText` and the record-note contract need no parsing changes, and both note formats behave the same.

Each value is stored in its typed form:

| Type       | Stored value     | Input rules                                                                  |
| ---------- | ---------------- | ---------------------------------------------------------------------------- |
| `text`     | string           | Trimmed, 1–500 characters                                                    |
| `number`   | decimal string   | Same rules as record-note numbers: no separators, no exponent, never rounded |
| `date`     | `YYYY-MM-DD`     | Real calendar date, no timezone shift                                        |
| `datetime` | ISO instant      | Requires `Z` or an offset; normalized to UTC, original offset kept           |
| `boolean`  | `true` / `false` | Exact booleans only                                                          |
| `choice`   | string           | Must match one of the key's options exactly                                  |
| `list`     | array of strings | 1–50 items, each 1–100 characters, duplicates removed, order kept            |

The first six types reuse the record-note column vocabulary and parsing in `src/modules/record-notes/record-contract.ts`; `list` is new and exists for `tags` and `aliases`.

Limits: at most 32 properties per note; keys are 1–64 characters.

### Key registry

**Proposed:** a new `note_property_key` table, one row per owner and normalized key:

- `userId`, `key` (normalized: trimmed, lower-cased, underscores and hyphens treated as spaces, internal whitespace collapsed to one space, so `Tanggal_Kirim`, `tanggal-kirim` and `tanggal kirim` are one key), `label` (the spelling first used, for display), `type`, `options` (for `choice`), `createdAt`, `updatedAt`.
- Primary key `(userId, key)`.

Rules:

- The first write of an unknown key registers it with the type of that write. Later writes must match the registered type; a mismatch is rejected with an error that names the key's type.
- "Tanggal" and "tanggal" are the same key, and so are spellings that differ only in separators. Different words (`tanggal kirim`, `tgl pengiriman`) are different keys; the registry cannot prevent synonyms, so the assistant guidance and inventory below exist to keep them from appearing.
- A write that registers a new key returns, in the tool result, the registered keys of the same type whose names are similar to it, so the assistant can switch to an existing key on the next step. The new key is still saved; this is a notice, not a block.
- A key with no remaining uses stays registered until it is deleted explicitly, so its type does not silently change.
- Changing a key's type or renaming it applies to every note that uses it. Existing values that do not fit the new type block the change and are listed; nothing is converted silently. Assistant-initiated renames and type changes require explicit user confirmation, matching protected record schema changes.

### Reserved keys

Three keys exist for every owner with fixed types and meaning:

| Key       | Type   | Meaning                                                                      |
| --------- | ------ | ---------------------------------------------------------------------------- |
| `tags`    | `list` | Free labels for grouping, such as `pemesanan`. Matching is case-insensitive. |
| `aliases` | `list` | Other names the note is known by. Title search also matches aliases.         |
| `date`    | `date` | The calendar day the note is about, distinct from when it was created.       |

The Indonesian names map to the reserved keys: writing `tanggal` means `date`, `tag` means `tags`, and `alias` means `aliases`, whether the user types them or the assistant sends them. This mapping applies to these three keys only; every other key is taken as written.

**Proposed:** a series of notes (one per day, per client, per meeting) is identified by a shared tag plus `date`, not by a separate `type` key. Fewer keys keep the assistant consistent.

### Revisions and conflicts

- Changing properties is a note update: it increments the note's `revision`, goes through the existing workspace command path (`applyWorkspaceCommand`) and uses the same revision checks and conflict handling as title and content changes.
- Assistant property writes go through the protected note tools (`protectNoteTools` / `NoteMutationService`), so an open editor defers them durably like any other assistant write.
- The Web editor saves property edits with the same autosave and presence lease as content edits.
- Trash and restore keep properties unchanged.

## Indexing and search

Two layers, both required:

1. **Structured filtering.** A GIN index on `workspace_item.properties` (scoped by `userId`) supports exact matches, list membership and date ranges. This answers questions like "today's order note" without relying on embeddings, which are unreliable for dates.
2. **Text indexing.** Properties are rendered as `label: value` lines (lists comma-separated, in key order) and included in the note's searchable and embedded text, between title and body. The index signature in `NotesService.index` and `prisma-workspace.repository.ts` must include these lines so that a property change re-indexes the note.

Keyword search in `NotesService.search` matches property lines the same way it matches body text, and title ranking also counts `aliases`.

Record notes keep their current indexing rule: title, description, column names and now properties are indexed; cell values are not.

## API

Extend the existing `/notes` endpoints rather than adding a separate resource:

- `GET /notes` and `GET /notes/items/:id` return each note's `properties`.
- `PATCH /notes/items/:id` accepts `properties` as a patch: a key with a value sets it, a key with `null` removes it, omitted keys are unchanged. The request carries the current `revision`.
- `POST /notes/items` accepts initial `properties`.
- `GET /notes/search` accepts property filters (same shape as the assistant filter below) and allows an empty text query when filters are present.
- New `GET /notes/property-keys` returns the owner's registry with each key's type, options and usage count.
- New `PATCH /notes/property-keys/:key` renames a key or changes its type/options, under the rules above. `DELETE /notes/property-keys/:key` is allowed only for unused keys.

Errors use the existing `ApiException` and error-code contract.

## Assistant integration

### Tools

Keep to existing tools to stay within the advertised schema budget (`advertised-tool-schema.spec.ts`, 89,000 bytes; 88.3k at last measurement). Adding these fields will exceed the budget, so field descriptions elsewhere must be trimmed in the same change (open work item 5 in `ASSISTANT_TUNING.md`).

- `create_custom_note` and `create_record_note`: optional `properties` object.
- `update_custom_note`: optional `properties` patch, with `null` removing a key. Record notes get the same patch through their existing metadata/context mutation path.
- `search_notes`:
  - `query` becomes optional when `filters` is present.
  - New `filters`: an array of `{ key, equals?, contains?, from?, to? }`. `contains` applies to `list` keys; `from`/`to` apply to `date`, `datetime` and `number` keys and are inclusive.
  - Results include each note's properties.
- `list_notes_workspace` and the note inventory attached when `note-capture` or `record-notes` loads (`note-skill-inventory.ts`) include each note's properties and the owner's key registry (key, type, options, usage count), bounded like the existing inventory and flagged when truncated.

Property values, like titles and content, are user data and never instructions.

### Guidance

Add to the `note-capture` and `record-notes` skills, with eval scenarios before the wording is final:

- To find a note the user names by topic plus a day ("catatan pemesanan hari ini"), resolve the day from the turn context, then filter by the series tag and `date` before falling back to title or text search.
- When creating a note that belongs to an existing series, copy the series tag and set `date`; find the series by filtering, not by title.
- The assistant may add any key it judges useful for finding or organizing the note later, not only keys the user asked for. Before creating a key, check the registry and reuse a registered key with the same meaning; a new synonym (`tgl pengiriman` next to an existing `tanggal kirim`) splits retrieval. If a write reports similar existing keys, move the value to the existing key unless the meaning differs.
- Set `aliases` only when the user names the note differently from its title or asks for it.
- Do not change a key's type or name without the user's explicit confirmation.

The default for orders and similar collections stays one record table with a date column. Properties do not change that choice.

## Web workspace

- A properties panel between the title and the body for both note formats, collapsed when the note has no properties.
- Add, edit and remove a property, with key suggestions from the registry and a value control per type (the record-note date picker for `date`, chips for `list`).
- A type mismatch or an unknown choice shows inline and keeps the draft.
- Workspace search gets a tag filter and a date range filter.
- Within a folder, notes with a `date` property are listed newest date first, before notes without one; the rest keep the current title order. Today the tree sorts by title (`workspace-tree.tsx`), which puts "Pemesanan 10 Nov 2026" before "Pemesanan 8 Nov 2026" and orders months alphabetically, so a folder of day notes would read out of order. No separate grouped view is needed for this.
- Labels and messages follow the existing Indonesian copy; reserved keys display as "Tag", "Alias" and "Tanggal".
- Visual design follows `apps/frontend/src/components/notes/DESIGN.md`; a Penpot pass is needed before building the panel.

Telegram and WhatsApp have no UI changes; properties are reachable through the assistant.

## Acceptance checks

- A property write with a value that does not match the key's registered type is rejected with an error naming the type, and nothing is saved.
- "Tanggal" and "tanggal" resolve to the reserved `date` key; `tag` and `alias` resolve to `tags` and `aliases`; no other key is mapped.
- In a folder of day notes, the tree lists them by `date`, newest first.
- Changing only properties increments the revision, re-indexes the note, and a stale revision is rejected.
- `search_notes` with `filters: [{ key: "tags", contains: "pemesanan" }, { key: "date", equals: "2026-11-08" }]` and no query returns exactly the matching note, including when the embedding provider is unavailable.
- Keyword search finds a note by an alias and by a property value.
- An assistant property write to a note open in the editor is deferred, not applied, and reported as pending.
- Trash and restore keep properties.
- The advertised tool schema stays within its size budget.
- Prompt eval scenarios:
  - With day order notes tagged `pemesanan` and an empty daily note, "Buka catatan pemesanan hari ini" finds today's order note through a property filter and links it.
  - "Buka catatan hari ini" still opens the daily note.
  - "tambah ini" with a forwarded order adds to today's tagged note, or creates it with the series tag and `date` when it does not exist.
  - Creating a second note in a series reuses the existing tag and does not register a new key.

## Owner decisions

Recorded 8 November 2026.

1. **Daily notes** do not get properties in this version.
2. **Indonesian reserved key names** `tanggal`, `tag` and `alias` map to `date`, `tags` and `aliases`. No other key is mapped.
3. **Wrong-type values are rejected,** unlike record-note cells, which keep mismatched input. Record notes keep their current behavior.
4. **The assistant may add keys it finds useful,** not only keys the user asked for. Consistency relies on the registry in the inventory and the reuse guidance.
5. **No grouped workspace view in this version.** Date ordering within a folder (see [Web workspace](#web-workspace)) covers the per-day order case.

## Implementation areas to verify before coding

- `workspace-rules.ts` command shapes and `applyWorkspaceCommand`, for where the properties patch fits.
- `prisma-workspace.repository.ts` save path and index signature.
- `NotesService.search`, `searchForAssistant` and `entries`, for filtering and the property text lines.
- `record-contract.ts` cell parsing, for reuse in property validation.
- `protected-note-tools.ts` and `note-agent-*`, for deferral of property writes.
- `notes-workspace-page.tsx`, `workspace-editor.tsx`, `record-note-editor.tsx` and `workspace-search.tsx` on the frontend.
