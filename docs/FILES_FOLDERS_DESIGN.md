# Files workspace design handoff

Date: 2026-10-18. Status: editable Penpot designs complete; application implementation is a separate task.

[Open the Files workspace in Penpot](https://penpot.muslimmujahid.com/#/workspace?team-id=2d1268b1-32bc-808d-8008-c8176b8b63f5&file-id=4a7e6716-c5b5-8080-8008-c936c7a3dabc&page-id=3ea14f7c-0cd4-80a3-8008-cdf059c04e64).

Product behavior is defined in [FILES_FOLDERS_SPEC.md](./FILES_FOLDERS_SPEC.md). The existing [DESIGN.md](../DESIGN.md) remains the visual authority; this feature extends Aurora Haze without replacing the global system.

## Artifact and navigation

- File: `sydia`, ID `4a7e6716-c5b5-8080-8008-c936c7a3dabc`.
- Page: `Sydia · Files workspace`, ID `3ea14f7c-0cd4-80a3-8008-cdf059c04e64`.
- 29 editable boards: 16 desktop screens at 1440 × 1000, nine mobile screens at 390 × 844, and four compact state panels.
- 72 representative prototype links and two named flows: **Files · Desktop · Browse and organize** and **Files · Mobile · Browse and organize**.
- Desktop flow starts at `3ea14f7c-0cd4-80a3-8008-cdf0b7b04a5a`; mobile flow starts at `3ea14f7c-0cd4-80a3-8008-cdf1d318c047`.

## Screen coverage

| Area              | Boards and behavior                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Browse            | Root list/grid, intermediate Kerja folder, nested Proyek Sydia, breadcrumbs, folder/file metadata and processing status.      |
| Select            | Desktop and mobile selection in both list and grid; selected count, clear selection, move, and permanent deletion.            |
| Find              | Global name search across folders; containing paths and Open location actions.                                                |
| Organize          | Move destination picker on desktop/mobile; desktop drag target and dragged-selection preview.                                 |
| Folder management | Normal creation, rename, and duplicate-name validation.                                                                       |
| Delete            | Recursive permanent-deletion confirmation on desktop/mobile, durable progress panel, and partial-failure recovery with retry. |
| Upload            | Current destination, per-file progress, and existing file action menu.                                                        |
| Supporting states | Empty folder, loading list, loading failure, and no search results.                                                           |

Useful board locators:

| Board                                               | ID                                     |
| --------------------------------------------------- | -------------------------------------- |
| Files / Root · List · Desktop                       | `3ea14f7c-0cd4-80a3-8008-cdf0b7b04a5a` |
| Files / Root · Grid · Desktop                       | `3ea14f7c-0cd4-80a3-8008-cdf0ef5bcb32` |
| Files / Bulk selection · Desktop                    | `3ea14f7c-0cd4-80a3-8008-cdf0fbf6e3a0` |
| Files / Search all folders · Desktop                | `3ea14f7c-0cd4-80a3-8008-cdf111dd955e` |
| Files / Move selection · Desktop                    | `3ea14f7c-0cd4-80a3-8008-cdf1499bffdc` |
| Files / Confirm permanent deletion · Desktop        | `3ea14f7c-0cd4-80a3-8008-cdf14debe926` |
| Files / Partial deletion · Retry failures · Desktop | `3ea14f7c-0cd4-80a3-8008-cdf1786ea724` |
| Files / Mobile · List                               | `3ea14f7c-0cd4-80a3-8008-cdf1d318c047` |
| Files / Mobile · Grid and selection                 | `3ea14f7c-0cd4-80a3-8008-cdf1e1c74b6a` |
| Files / Mobile · Permanent deletion                 | `3ea14f7c-0cd4-80a3-8008-cdf242b4cdb9` |

## Visual and interaction intent

Reuse Sydia's logo, Inter typography, application navigation, and existing Aurora image treatment on the upload action. The file area stays white, with warm paper chrome, ink text, muted metadata, coral selection tint, and red destructive/error messages. Flat rows and restrained tile borders keep the file names primary.

Desktop retains the app navigation at the left, then uses the remaining width for search, view controls, breadcrumbs, and contents. There is no folder tree sidebar. Folder navigation and selection use separate targets. List/grid switches share the same items and selection state.

Mobile keeps folder creation and upload visible, shows explicit selection controls, and uses a persistent bottom action bar for selected items. The destination picker supplies the move workflow without drag gestures. Clipped item regions represent scroll viewports; content below their bounds is intentionally offscreen.

Deletion names the affected selection and counts all descendants. The illustrative selection is Belajar, Catatan rapat.pdf, and Invoice Oktober.pdf: 12 files and three folders in total. Partial recovery shows ten files deleted, two failed, two subfolders deleted, and Belajar retained until its remaining files are removed. Failures identify the affected files and storage problem; retry targets the two failures.

## Defaults and implementation boundaries

- Folders first, A–Z sorting, and initial list view remain proposed defaults. The sorting question was not explicitly confirmed by the user.
- All file names, counts, dates, and progress values are illustrative design content.
- Prototype links demonstrate representative navigation and dialog states. They do not perform real uploads or data mutations and do not simulate every CRUD outcome.
- Use stable identities, server ownership/ancestry validation, paginated listings, atomic moves, and durable deletion operations as specified in the product spec.
- Implement keyboard focus, touch target sizing, announcements, responsive layout, and actual loading/error behavior in the application. Static design review does not validate runtime accessibility or backend correctness.
- Folder organization must preserve assistant access and existing attachment references. No folder sharing, folder-scoped conversations, local folder imports, Trash, storage quotas, or file-count caps are introduced.
- No application code or schema changes were made for this design task.

## Review evidence

An independent finish review returned **ship** for the sampled design scope. It inspected actual Penpot exports of desktop list/grid, mobile grid selection, mobile permanent deletion, and desktop partial deletion, plus scoped structural reads. No material clipping, overlap, legibility, or deletion-clarity fixes were required in those samples.

No HTML/CSS detector or application tests apply to the Penpot artifact itself. Runtime and cross-channel verification remain part of implementation. The independent documentation helper failed before writing this file; the primary agent completed this handoff from the saved artifact inventory and review report.
