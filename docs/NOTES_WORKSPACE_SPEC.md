# Notes workspace specification

Status: design interview completed for the core behavior; proposed defaults below remain open for refinement.

## Agreed product behavior

### Workspace and organization

- Evolve `/daily-notes` into one Notes workspace containing daily notes and custom notes.
- Keep daily notes in a dedicated section with their existing date navigation and assistant behavior. They cannot be moved into custom folders.
- Custom folders support nested subfolders. Custom notes may also live at the workspace root.
- Support dragging custom notes and folders to a destination, plus a **Move to…** destination picker for keyboard and mobile use.
- Allow the same custom note title in different folders, but require unique note titles within each folder. Show folder paths when disambiguating notes.

### Creating and editing notes

- Use the existing rich-text editor and autosave for custom notes, with a separate editable title.
- **New note** immediately creates an **Untitled** note in the selected folder and focuses its title. Empty custom notes remain saved.
- Preserve the existing daily-note behavior, including one note per local calendar date.
- When an external edit conflicts with a local edit, pause autosave and preserve the local draft. Let the user choose which changes to keep.

### Opening the workspace

- Resume the last-opened note using state stored in `localStorage`.
- When there is no stored state, open today's daily note.
- Provide a **Today** shortcut for returning to the daily journal.

### Internal links and backlinks

- Include Obsidian-style `[[note links]]` and backlinks in the first version.
- Both custom and daily notes can link to either kind of note and display incoming links.
- Renaming or moving a note must preserve existing resolved links.
- When a link does not resolve to an existing note, offer **Create note**. Typing a link alone must not create a note.
- Link suggestions show folder paths so notes with identical titles can be distinguished.

### Search

- Workspace search matches titles and body text across custom notes and daily notes.
- Include folder and note-type filters.
- Keep broader topic search available through the assistant; conceptual search is not required in the workspace search box.

### Assistant access

- Support creating, reading, searching, editing, renaming, moving, and deleting custom notes and folders through Web chat, Telegram, and WhatsApp.
- Preserve the current default: an unspecified request such as **catat ini** goes into today's daily note.
- When a request identifies a custom note or folder, use that destination instead.
- Assistant actions must honor ownership, folder constraints, note links, Trash, and edit conflicts just as workspace actions do.

### Trash

- Deleting a custom note moves it to Trash.
- Deleting a custom folder moves the folder and all its contents to Trash together.
- Allow restoration and explicit permanent deletion.
- Keep items in Trash indefinitely; do not expire them automatically.

## Proposed defaults for implementation

These are recommendations, not additional decisions already supplied by the user.

- Store note content and folder structure with the existing account-backed application data. Use `localStorage` for navigation state, scoped to the signed-in user.
- Treat a direct link to a specific note or daily date as higher priority than the saved last-opened note. Fall back to today's daily note if the stored destination is missing, inaccessible, or in Trash.
- Present the folder tree and Daily Notes entry beside one active editor on desktop; make navigation available in a drawer on narrow screens.
- Rename the navigation label to **Notes**. Prefer `/notes` as the canonical workspace route while preserving existing `/daily-notes?date=…` links.
- Sort folders and notes alphabetically, with folders first. Dragging changes the parent folder rather than assigning a manual sort order.
- Generate distinct placeholder titles such as **Untitled**, **Untitled 2**, and **Untitled 3** when creating multiple notes in the same folder.
- Require distinct sibling folder names, prevent moving a folder into itself or any descendant, and reject moves that create a naming collision.
- Let a folder search filter include descendant folders. Exclude Trash from normal search, link suggestions, assistant retrieval, and the active tree.
- Use stable destination identities for resolved links; display the current title or date and retain enough label information to explain a missing destination.
- Create a note from an unresolved link in the current custom note's folder, or at the custom workspace root when writing a daily note. Require a destination choice if the target is ambiguous.
- Restore trashed items to their original location when possible. Ask for a destination or a new name if the parent no longer exists or a name conflicts. Keep links recoverable when their original destination is restored.
- Detect edit conflicts on the server using a revision or equivalent atomic check. Preserve the rich-text document, note links, and local draft; do not silently overwrite a newer version or flatten existing content during an assistant edit.
- Keep current daily-note clearing and deletion behavior separate from the new custom-note Trash behavior.

## Existing implementation to build on

- Frontend route: `apps/frontend/src/routes/_app.daily-notes.tsx`.
- Daily workspace: `apps/frontend/src/components/daily-notes/daily-note-page.tsx`.
- Existing editor/autosave: `apps/frontend/src/components/daily-notes/use-daily-note-editor.ts`.
- Existing API and query integration: `apps/frontend/src/lib/services/api/daily-notes/`.
- Daily-note persistence, indexing, and hybrid assistant search: `apps/backend/src/modules/daily-notes/daily-note.service.ts`.
- Current assistant tools: `apps/backend/src/modules/conversations/services/daily-note-tools.ts`.

The existing rich-text documents and daily-note date addressing must remain readable. Extend retrieval to include custom notes without changing the agreed default capture destination.

## Implementation outline

1. Define custom-note, folder, link, Trash, and revision contracts with owner-scoped persistence. Establish how daily-note references participate in links without moving daily notes into the custom tree.
2. Implement note/folder operations, search, restoration, permanent deletion, and conflict detection through backend services and APIs.
3. Add rich-text note references and backlink retrieval for both note kinds. Maintain references through renames, moves, Trash, and restoration.
4. Build the unified navigation, immediate note creation, title editing, move picker, drag and drop, search, Trash, and last-opened state around the existing editor.
5. Extend assistant tools, tool selection, and guidance for custom notes and folders across all channels while preserving the daily capture default.
6. Verify the complete flow with representative data, existing daily notes, nested folders, duplicate titles in different folders, linked notes, and competing edits.

## Acceptance checks

- Existing daily notes and date links still open correctly; daily notes remain separate from custom folders.
- An empty custom note survives reload; a second new note in the same folder gets a distinct placeholder title.
- Notes and whole folder subtrees can be moved by drag and drop and by the picker. Cycles and naming collisions are rejected without partial changes.
- Links and backlinks work in both directions between daily and custom notes. Moving or renaming a destination preserves navigation.
- Unresolved links do not create notes until **Create note** is chosen. Identical titles in different folders remain distinguishable.
- Workspace search finds title and body matches and applies folder/type filters without including Trash.
- Trashing and restoring a folder preserves its subtree; permanent deletion is explicit; items do not expire automatically.
- `localStorage` resumes the last-opened note for the current user; absent state opens today's daily note. Direct note links still select their requested destination.
- An external change during editing cannot silently overwrite either the server version or the local draft.
- Assistant requests can manage custom notes and folders through all three channels, while **catat ini** still targets today's daily note.
- Ownership isolation applies to folder operations, links, backlinks, search, Trash, and assistant access.
- Mobile and keyboard users can create, open, move, link, and restore notes without relying on dragging.
