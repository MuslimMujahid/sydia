# Files and folders specification

Status: core product decisions confirmed through the design interview; implementation and interaction defaults below are proposed for review.

Date: 2026-10-18.

## Purpose

Enhance `/files` so users can organize their personal file library into nested folders, find items by name, and reorganize or permanently delete multiple items. Preserve Sydia's existing upload, document processing, and assistant behavior.

The primary user task is to find and organize saved files. This is an Operate surface within the existing dashboard and design system, with Bahasa Indonesia as the first-class interface language.

## Confirmed product decisions

| Area                 | Decision                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hierarchy            | Support nested folders from the first release.                                                                                                                         |
| Ownership            | Files and folders remain private to their owner. No sharing or collaboration.                                                                                          |
| Assistant            | Folders provide organization only. They do not scope conversations or change assistant retrieval access.                                                               |
| Membership           | Each file has one location: one folder or the root.                                                                                                                    |
| Existing files       | All existing files start at the root.                                                                                                                                  |
| Upload destination   | Uploads from `/files` go into the folder being viewed. Web chat, Telegram, and WhatsApp uploads go into the root.                                                      |
| Folder deletion      | Permanently delete the selected folder and all descendants after explicit confirmation. No Trash or restore.                                                           |
| Bulk actions         | Support bulk move and bulk permanent deletion of files and folders.                                                                                                    |
| Naming               | Sibling folder names must be unique ignoring case. Duplicate file names are allowed.                                                                                   |
| Conflicting moves    | Require renaming a conflicting folder before moving it. Never merge folders or overwrite files.                                                                        |
| Search               | Search file and folder names across the whole library. Show result paths and allow opening the containing location. File-content search is excluded.                   |
| Drag and drop        | Support moving existing files, folders, and multi-item selections on desktop. Also provide a Move to… picker for keyboard and mobile use.                              |
| Views                | Offer both list and grid views with equivalent actions.                                                                                                                |
| Local folder imports | Defer uploading entire local folders and preserving their directory trees. Multiple-file upload remains available.                                                     |
| Partial deletion     | Completed deletions remain permanent. Show successes and failures and allow retrying only failed work. A folder remains visible until all of its contents are deleted. |
| Navigation           | Navigate through folder entries and breadcrumbs. No folder tree sidebar.                                                                                               |
| Capacity             | Use 10,000 files and 1,000 folders per user as initial performance test targets, not product limits. Do not impose file-count limits.                                  |
| Entitlements         | Storage quotas and entitlement enforcement are a separate future task.                                                                                                 |

## Scope boundaries

Include creating and renaming folders, navigating nested folders, moving files and whole folder subtrees, uploading into the current folder, global name search, list/grid switching, bulk selection, and permanent deletion with progress and recovery.

Preserve existing file editing, opening, processing status, and Ask in chat actions. Moving or renaming a folder must preserve document IDs, content URLs, file assets, message attachments, extracted content, and embeddings. A move must not copy storage objects or trigger reprocessing.

Exclude sharing, permission inheritance, folder-scoped conversations, assistant folder-management tools, Trash, restore, version history, copies, shortcuts, manual item ordering, local folder imports, folder ZIP downloads, new content-preview functionality, file-content search, and quota/entitlement work. Existing upload formats and per-upload size validation remain in effect.

## Proposed interaction defaults

These details complete the flows but were not individually confirmed in the interview.

### Browsing and navigation

- Keep `/files` as the root. Address folders by stable ID, for example `/files?folder=<id>`, so refresh, direct links, and browser Back/Forward work.
- Show a breadcrumb beginning with **File**, followed by the current ancestor chain. Folder names are navigation links; selection controls are separate.
- Show only immediate children while browsing. The root contains root folders and files without a folder.
- Keep **Unggah file** and **Folder baru** discoverable. Offer a labeled list/grid toggle and a global name-search field.
- Default to list view. Remember view preference per signed-in user in browser-local storage; a preference persistence failure must not prevent browsing.
- Preserve the dashboard's current visual language. Both views show item names and selectable controls. Files retain type, size, date, and processing status; folders use a recognizable folder icon. Grid view does not require generating thumbnails.
- Default to folders first and names A–Z. Offer name and date-added sorting in both directions; folders remain grouped first. Use an ID tie-breaker for deterministic results. Date added means the file upload or folder creation time, not the time an item was moved.
- Support long names and deep breadcrumbs without page overflow; provide an accessible way to reveal truncated names and navigate collapsed ancestors.
- If a folder is missing or inaccessible, show an explicit unavailable state with a return-to-root action. If the currently open folder is successfully deleted by the user, navigate to its nearest surviving ancestor.

### Creating and renaming folders

- Create a folder in the currently viewed folder or root. Use a short named-input dialog with explicit submit and cancel actions.
- Renaming changes the display name, preserving the folder's identity, subtree, and links.
- Trim surrounding whitespace and normalize Unicode consistently before checking folder-name uniqueness. Use one locale-independent case-insensitive comparison rule in application validation and database enforcement.
- Proposed folder-name validation: 1–255 Unicode code points after normalization; reject `.` and `..`, path separators, and control characters. Preserve internal spaces and user capitalization for display.
- Reject a duplicate folder name within the same parent, including the root. Identical folder names in different parents are allowed. Files and folders may share a display name because only folder names participate in sibling uniqueness.
- Show validation and conflict messages next to the input and preserve the entered name after failure. Do not silently append numbers or rename existing items.

### Selection and moving

- Provide a checkbox for each item, a selected-item count, clear selection, Move to…, and permanent delete actions in both views. On touch devices, selection must be directly accessible without drag gestures or hover.
- Select all applies to the displayed page only and is labeled accordingly. Selection can span loaded pages of the same listing, with a visible count, but clears when the folder, search query, or sort changes. Switching list/grid preserves selection.
- The Move to… dialog browses folders lazily, includes the root, shows the destination breadcrumb, and requires an explicit move action. Retain selection and destination after an error.
- A move changes an item's parent. Moving a folder moves its whole subtree without changing descendant identities.
- Normalize a selection containing both an ancestor folder and its descendants: move the ancestor once and keep the subtree intact. Do not flatten explicitly selected descendants into the destination.
- Reject moving a folder into itself or any descendant, cross-owner moves, unavailable destinations, and sibling folder-name collisions. Validate conflicts among selected folders as well as against the destination's existing folders.
- Treat moving an item to its existing parent as a no-op. A proposed bulk move is atomic: either all effective moves commit or none do. Return actionable conflict details when validation fails.
- Desktop drag-and-drop uses exactly the same selection normalization, destination checks, and move contract. Indicate valid targets, show the selected-item count during a drag, allow Escape to cancel, and provide success or failure feedback.
- Folder rows/tiles and visible ancestor breadcrumbs are drop targets. Dragging does not open folders or perform a move until a valid drop. No drag-to-delete gesture.

### Uploading files

- Capture the current folder ID when the user selects files. Navigation during an upload must not change its destination.
- If upload is started from global search results, use the underlying browsing location and show that destination beside the upload action/status. Search results themselves are not a destination.
- Validate destination ownership and availability before accepting an upload and again when committing its database record. If the destination disappears or begins deletion, fail explicitly and clean up any stored artifacts. Never silently redirect the upload to root.
- Maintain root placement for uploads originating from chat channels, independently of the folder currently open in the dashboard.
- Preserve duplicate file names as distinct records. A multi-file upload reports each file's result and identifies failed or unattempted files; retry must not silently upload successful files again.
- Organizing a processing or failed document is allowed. Existing processing state and retry behavior are independent of folder membership.

### Global search

- Search display titles of files and names of folders across all locations owned by the user. Use case-insensitive substring matching; do not require an exact name.
- Search results show type, display name, and current parent path, with an **Open location** action. Opening a folder result enters that folder; existing file-open behavior remains available.
- Keep search separate from assistant semantic/content search. Descriptions, extracted content, transcripts, and image descriptions are not part of this search contract.
- Paginate on the server and support both views and bulk selection in search results. Parent-and-descendant selection is normalized using the same move/delete rules as browsing.
- Clearing search returns to the underlying folder. Search and folder IDs belong in validated route state so refresh and browser history preserve navigation.

## Permanent deletion and recovery

### Confirmation

- Use the same deletion flow for a single file, a folder subtree, or a mixed bulk selection.
- Before confirmation, resolve the effective selection on the server. Count every affected file and folder once, including descendants. Selecting both a folder and a contained file must not double-count or schedule duplicate work.
- For a single folder, show its name and total files and subfolders affected. For bulk deletion, show selected names or a compact summary plus total affected files and folders. State clearly that deletion is permanent and cannot be undone.
- Use an explicit destructive label such as **Hapus permanen** and provide **Batal**. Starting deletion requires this confirmation; closing the preview does nothing.
- Bind confirmation to an owner-scoped selection snapshot/version. If membership changes before deletion starts, refresh the counts and require confirmation again rather than deleting newly added content without consent.

### Execution

- Accept confirmed deletion as durable background work, returning an operation ID. Progress must survive page navigation, refresh, request timeouts, and worker restarts.
- Lock the affected selection against conflicting uploads, moves, renames, and overlapping deletions while the operation runs. Checks must be enforced on the server, including writes that started before the lock was acquired.
- Keep folders visible with a deleting state until their contents have been deleted. Remove folders from the leaves upward, only after every contained file and subfolder is successfully removed.
- Reuse the existing document-removal and artifact-cleanup mechanisms. Cover original objects, extraction checkpoints, file assets, attachment relations, document records, chunks, and embeddings. Do not rely on deleting folder/database rows to clean up external objects.
- In-flight processing must not recreate deleted records or orphaned artifacts. Cleanup and job replay must be idempotent.
- Track logical record removal and outstanding artifact cleanup separately. Do not label an item fully deleted while required cleanup is still pending or failed; preserve enough operation state to finish cleanup even if the database record is already gone.
- Deleting a file makes it unavailable for future opening, attachment retrieval, and assistant retrieval. Existing conversation text remains historical; deletion does not promise erasing previously generated messages or separately stored memories.

### Partial failure

- Completed deletions remain deleted. There is no rollback or Undo.
- Report counts for completed files/folders, failed work, and work still pending. Folder retention caused by a failed child must be distinguishable from an additional independent deletion failure.
- Show a persistent operation summary with item-level failures and **Retry failed items**. Large failure lists are paginated. A toast alone is insufficient for an unresolved failure.
- When an attempt reaches a terminal partial-failure state, unlock surviving items. A retry may retry cleanup for previously confirmed IDs that are already logically removed. Before retrying retained folders, refresh the preview and require confirmation if their membership changed; newly added content is never silently included.
- Retries resume incomplete stages only. Already deleted IDs are treated as completed, not as an instruction to delete a same-named replacement.
- Bound automatic retries, log operational failures at WARN/ERROR, and expose stalled jobs for operators. Do not report an empty result or success when a backend operation failed. Avoid logging file content or unnecessary personal metadata.
- A network timeout after submission is an unknown outcome. Recover the existing operation through its idempotency key/operation ID rather than submitting another deletion blindly.

## Proposed backend and data design

Exact type and endpoint names may change during implementation if the behavior and compatibility guarantees remain intact.

### Persistence

| Record             | Proposed fields and guarantees                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `FileFolder`       | Stable `id`, `userId`, nullable `parentId`, display `name`, normalized name, timestamps, and revision or equivalent concurrency metadata.       |
| `Document`         | Add nullable `folderId`; `null` means root. Keep current document/file-asset identities and processing fields.                                  |
| Deletion operation | Owner, idempotency key, confirmed manifest/version, status, counts, timestamps, paginated per-item/stage outcomes, and resumable cleanup state. |

- Use a dedicated Files hierarchy, separate from Notes `WorkspaceItem` folders. Notes use different content and Trash rules; this feature does not change that workspace.
- Enforce parent ownership and acyclic ancestry, including concurrent moves. A transaction must protect validation and writes; a preflight ancestry check alone is insufficient.
- Enforce unique normalized sibling folder names in the database, including root folders. A nullable-parent uniqueness constraint must explicitly handle root `null` semantics.
- Enforce same-owner document-to-folder references. Use restrictive folder deletion until contents are removed; do not use cascading folder deletion to bypass file cleanup.
- Index owner/parent membership and sort keys; plan indexing for global name search. Return lightweight listing metadata without extracted text or chunks, and avoid a query per item's breadcrumb.
- Folder paths derive from stable IDs and current ancestry. Renaming or moving an ancestor updates displayed paths without rewriting file identities or storage keys.
- Create schema changes additively and leave existing documents at root. Do not rewrite existing file bytes, regenerate embeddings, or alter existing unrelated schema work.

### Proposed API surface

| Operation                | Proposed contract                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browse                   | `GET /file-library/items?folderId=…&offset=…&limit=…&sort=…&direction=…`; omitted folder means root. Returns immediate children as typed file/folder summaries. |
| Folder/breadcrumb detail | `GET /file-library/folders/:id`; returns folder and owner-scoped ancestry.                                                                                      |
| Name search              | `GET /file-library/search?q=…&offset=…&limit=…&sort=…&direction=…`; returns file/folder summaries with paths.                                                   |
| Create folder            | `POST /file-library/folders` with `name` and nullable `parentId`.                                                                                               |
| Rename folder            | `PATCH /file-library/folders/:id` with `name` and a revision precondition.                                                                                      |
| Move                     | `POST /file-library/moves` with typed item IDs, nullable destination folder ID, and concurrency preconditions.                                                  |
| Delete preview           | `POST /file-library/delete-previews` with typed item IDs; returns exact effective counts and an expiring confirmation token.                                    |
| Start deletion           | `POST /file-library/deletions` with confirmation token and idempotency key; returns `202` and operation ID.                                                     |
| Progress/recovery        | Owner-scoped deletion list/detail endpoints and paginated failure details so the client can recover active or unresolved operations after refresh.              |
| Retry                    | `POST /file-library/deletions/:id/retry`; accepts updated confirmation when surviving-folder membership changed.                                                |
| Upload                   | Extend existing `POST /documents` multipart input with optional folder ID. Omission preserves root placement.                                                   |

- Use the existing NestJS authentication, validation, error codes/envelope, repository boundaries, and response interceptor. Paginated responses use the shared `{ data, pagination: { offset, limit, total } }` contract. Controllers return domain values or the shared pagination wrapper rather than double-wrapping them.
- Keep existing document detail, content, edit, retry, and assistant-facing contracts compatible. Do not redefine an omitted folder parameter on an existing all-documents API to mean root accidentally; the new browsing boundary owns root-only listing.
- Use document IDs for file item IDs and folder IDs for folder items; carry an explicit item type. Never infer identity from a name or path.
- Use existing conflict/validation error codes with structured reasons for duplicate names, stale confirmation, invalid destinations, cycles, and operations in progress. Return unavailable/not-found behavior for inaccessible resources without leaking another user's paths or counts.
- Bounded page sizes, request payload sizes, and worker batches are operational controls, not limits on how many files a user may store. Do not silently truncate an operation; stage or explicitly chunk larger selections where needed.

### Frontend integration

- Keep route state in TanStack Router and server data in TanStack Query. Query keys include folder/search parameters, sorting, and pagination; list and grid consume the same item data and selection model.
- Reuse the existing UI primitives, forms, API client, document editing, and document content URLs. Keep domain components under the existing documents area or a clearly named file-library area.
- Invalidate affected source/destination listings, search paths, breadcrumbs, and relevant document/chat caches after mutations. Moving/renaming an ancestor must not leave stale descendant paths.
- Keep processing polling for visible processing files. Poll active deletion operations independently and stop on terminal states; refresh affected listings as progress is confirmed.
- Handle initial loading, page loading, an empty library, an empty folder, no search matches, unavailable folders, duplicate names, failed uploads, invalid moves, deletion progress, and partial failure explicitly.
- Preserve keyboard navigation, visible focus, semantic links and selection controls, accessible action names, dialog focus restoration, and live announcements for move/delete results. Core actions must not depend on hover, drag-and-drop, color, or tooltips.

## Scale and future quota compatibility

- Initial representative load: 10,000 files and 1,000 folders for one user, with uneven distribution, duplicate file titles, long paths, and deep nesting. Include a flat folder containing thousands of files and a large subtree deletion.
- These numbers are test fixtures, not hard limits. Verify browsing, uploading, searching, and moving with more than 10,000 files; no quota, entitlement, or file-count rejection belongs in this feature.
- Paginate browse, search, destination browsing, operation history, and failures. Proposed default page size: 50; maximum page size: 100. Never fetch the entire library or tree to render one page or populate the move picker.
- Traverse deep/large trees without recursion-stack assumptions or one unbounded transaction for physical deletion. Large deletion is resumable background work with bounded batches.
- Proposed performance acceptance target: warm browse/search API p95 under 500 ms on a documented representative test environment, excluding network transit. Record actual query latency, payload size, and UI behavior rather than claiming performance from fixture size alone.
- Preserve authoritative asset byte sizes and an upload service boundary where later storage-entitlement checks can be added. Do not add quota tables, quota UI, plan checks, or subscription-dependent behavior now.

## Delivery outline

1. Add folder persistence, ownership/name constraints, root migration, hierarchy concurrency protection, and typed repository contracts.
2. Add paginated library browsing/search, folder create/rename/detail, atomic moves, and optional upload destination while preserving existing document consumers.
3. Add deletion previews, exact selection confirmation, durable operations, progress/recovery, idempotency, and retry integration with existing artifact cleanup.
4. Extend `/files` with breadcrumbs, create/rename, list/grid views, global search, selection, move picker, destructive confirmation, and progress/failure UI.
5. Add desktop drag-and-drop through the same move contract, then verify desktop, keyboard, and mobile flows against the same server behavior.
6. Complete regression and representative-load validation before release. Implement behavior and its tests together at each step.

## Acceptance and verification

| Scenario                                                                   | Expected result                                                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Existing user opens `/files` after migration                               | All existing documents appear at root; IDs, content URLs, processing results, and chat attachments still work. |
| Create nested folders, refresh, then use browser Back                      | Correct current folder and breadcrumbs persist through URL/history navigation.                                 |
| Create `Work` then `work` in the same parent, including root               | Second creation fails clearly; equivalent concurrent creation cannot bypass uniqueness.                        |
| Use the same folder name under two different parents                       | Both succeed.                                                                                                  |
| Upload two files with identical names                                      | Both exist independently; neither is overwritten.                                                              |
| Upload while browsing a folder; receive files through each chat channel    | Dashboard upload uses the captured folder; chat-channel files use root.                                        |
| Destination is deleted during upload                                       | Upload fails visibly and artifacts are cleaned up; no root relocation.                                         |
| Move/rename an ancestor containing ready and processing files              | IDs, chat references, processing state, and storage objects are preserved; displayed paths update.             |
| Select a folder plus one of its descendants                                | Move/delete processes the subtree once, preserves hierarchy on moves, and counts descendants once.             |
| Move two same-named folders from different parents to one destination      | Entire move is rejected with conflict details; no partial move or folder merge.                                |
| Move a folder into itself/descendant, including competing concurrent moves | Server rejects the cycle and keeps a valid tree.                                                               |
| Search for a name inside a deeply nested folder                            | Global result shows its current path; Open location reaches the containing folder.                             |
| Toggle list/grid with selected items                                       | View changes; selected identities and available actions remain equivalent.                                     |
| Drag a multi-item selection on desktop                                     | Valid drop uses the bulk move contract; invalid drop changes nothing; picker works by keyboard and touch.      |
| Cancel permanent deletion preview                                          | No records or storage objects change.                                                                          |
| Add a descendant after preview but before confirmation                     | Stale confirmation is rejected; revised counts require confirmation.                                           |
| Start subtree deletion, then refresh or restart the worker                 | Same operation resumes with accurate progress and no duplicate deletion.                                       |
| Eight file deletions succeed and two fail                                  | Eight remain deleted; failures are explicit and retryable; incomplete parent folders remain visible.           |
| Add content to a surviving folder after partial failure, then retry        | Retry refreshes confirmation before including any new content.                                                 |
| Storage/checkpoint cleanup fails after logical removal                     | Operation retains pending/failed cleanup state and finishes it on retry without declaring premature success.   |
| Processing completes concurrently with deletion                            | Deleted content cannot reappear; later artifacts are cleaned up.                                               |
| Use another user's folder, file, preview token, or operation ID            | No access, counts, names, paths, or mutation results are exposed.                                              |
| Load a library exceeding the representative counts                         | Feature continues working without a file-count or entitlement rejection.                                       |

Verification should cover service rules, real database constraints and transactions, authenticated API boundaries, storage/queue failure boundaries, and browser interactions. Use controlled failure injection and condition-based assertions rather than sleeps or tests that mirror implementation internals.

Suggested commands from repository root, once the corresponding implementation/tests exist:

```bash
bun run --cwd apps/backend test --runInBand --testPathPatterns='file-library|file-folder|document'
bun run --cwd apps/backend test:e2e --runInBand
bun run --cwd apps/frontend test:e2e --grep 'Files and folders'
bun run check-types
bun run lint
```

When checking attachment regressions, run the frontend/backend in development mode and use `/chats` to compare Web chat, Telegram, and WhatsApp previews, resetting sessions between targeted checks as described in `docs/CHAT_PREVIEWS.md`. Verify real ingress placement separately at the upload/gateway boundary; the preview page is not a substitute for those checks.

This document specifies future behavior. No application code, schema migration, or runtime test result is delivered by this specification task.
