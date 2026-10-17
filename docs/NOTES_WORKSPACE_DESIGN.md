# Notes workspace design handoff

Penpot file: [Sydia](https://penpot.muslimmujahid.com/#/workspace?team-id=2d1268b1-32bc-808d-8008-c8176b8b63f5&file-id=4a7e6716-c5b5-8080-8008-c936c7a3dabc&page-id=3f4df29d-ec9d-80b1-8008-cd9183c88093).

Page: **Sydia · Notes workspace**.

Product requirements: [Notes workspace specification](./NOTES_WORKSPACE_SPEC.md).

## Direction

Extend Sydia's existing [Aurora Haze system](../DESIGN.md). These decisions apply to the Notes workspace; the global design system remains the visual authority. The primary task is to open, write, and organize a note while retaining its folder or daily-date context.

- Use the file's existing Inter typography, original Sydia logo, warm background, and Aurora primary button asset.
- Keep the existing application navigation. Add a contextual notes navigator alongside one active editor.
- Keep writing on a flat white surface. Use dividers and spacing for hierarchy rather than surrounding every section with a card.
- Reserve accent backgrounds for selection and the existing primary-action treatment. Render note-link labels in dark text with an underline for readable contrast.
- Place backlinks after the document; avoid introducing a persistent fourth column.
- All displayed note content is illustrative design data.

## Desktop composition

Frames are 1440 × 1000.

- Application navigation: 272 px wide.
- Workspace header: 80 px tall, containing the workspace label, **Hari ini**, and **Catatan baru**.
- Notes navigation: 280 px wide below the workspace header. Contains search, a dedicated daily-note entry, nested custom folders, and Trash.
- Editor navigation: 64 px tall, with the current folder/date context, save state, and note actions.
- Writing measure: 728 px, inset from the editor navigation. Editable title, contextual metadata, compact rich-text toolbar, document, and backlinks.
- Footer: quiet autosave status; conflicts replace this status with an explicit paused state.

Daily notes expand their date navigator in the contextual sidebar. The custom folder tree stays separate and remains accessible below it.

## Screen coverage

- **Custom note · Desktop** — nested folders, selected custom note, rich text, an internal link, and incoming links.
- **Daily note · Desktop** — date title, month navigator, dates with notes, recent daily entries, and cross-type note links.
- **New note · Immediate creation** — editable placeholder title with caret, empty document, and saved-empty-note behavior.
- **Search · Titles and body text** — exact-text results, note-type and folder filters, paths, excerpts, and both custom/daily results.
- **Link picker · Existing and unresolved notes** — matching note titles disambiguated by folder path, plus an explicit create action.
- **Move note · Destination picker** — folder search, hierarchy, current location, selected destination, and a commit action usable without dragging.
- **Trash · Restore and permanent deletion** — original locations, folder subtree context, restoration, explicit permanent-delete actions, and indefinite retention.
- **Edit conflict · Preserve local draft** — paused autosave, local/server comparison, source context, and explicit resolution choices.
- **Note actions · Rename move link and trash** — a contextual note menu with a distinct destructive action.
- **Mobile · Custom note** and **Mobile · Daily note** — 390 px writing layouts with compact formatting controls and collapsible backlinks.
- **Mobile · Notes navigation** — a dedicated navigation surface with nested folders, a daily-note entry, search, Trash, and immediate note creation.
- **Mobile · Search results** — compact title/body results with folder and note-type filters.
- **Mobile · Link suggestions** — a bottom sheet with destination paths and explicit creation of unresolved notes.
- **Interaction details · Folder empty loading error delete** — inline folder creation, loading skeletons, a recoverable save error, empty-folder/search treatments, permanent-delete confirmation, and the navigation-state rule.
- **Linked note · Riset pengguna** — a resolved link destination with its own content and selected tree entry.
- **Move complete · Destination retained** — the destination path and tree position after moving a note.

The design contains 17 native editable frames: 11 desktop screens, one supporting-state reference board, and five mobile screens. The desktop frames use 1440 × 1000; the reference board uses 1440 × 900; mobile frames use 390 × 844.

Two named prototype starting points are **Notes workspace · Desktop** and **Notes workspace · Mobile**. Representative transitions cover navigation, creation, search results, internal-link selection, note actions, move selection, and conflict resolution. Controls without a dedicated prototype transition remain design intent rather than simulated application behavior.

## Interaction intent

- **Hari ini** opens the daily note for the current date.
- **Catatan baru** creates an empty custom note in the selected folder and focuses its title.
- Search operates across both note types; folder filters apply to the custom hierarchy.
- Selecting an existing internal-link suggestion resolves to a stable note identity. A typed unresolved link creates nothing until the create action is chosen.
- Dragging moves a note or folder to a parent; **Pindahkan ke…** supplies the equivalent destination-picker flow.
- Trash restoration retains the original hierarchy when possible; permanent deletion is a separate explicit action.
- A competing update pauses autosave and preserves the local draft while the user selects a resolution.
- Last-opened navigation state belongs in user-scoped `localStorage`; missing state opens today's daily note.

## Implementation boundaries

Penpot frames describe layout, content hierarchy, and interaction intent. Prototype navigation demonstrates representative transitions; it does not implement rich-text editing, persistence, drag-and-drop validation, searching, or synchronization.

Implement keyboard focus, accessible names, 44 px touch targets on mobile, loading and error recovery, owner isolation, and revision checks in application code. Preserve all agreed behavior in the product specification.

## Verification

- Exported-image review covered mobile custom notes, mobile navigation, desktop conflict, and desktop link picker. Mobile text fit and visual consistency were checked within that sample. Fresh desktop daily-note and mobile search images were also inspected without visible issues.
- The conflict review found clipped footer text and a saved-state checkmark during paused autosave. Both were corrected in the native design: the footer text fits its bounds and the checkmark is now a warning icon. A targeted live-data check found no text overflow in the corrected conflict frame.
- The conflict PNG export retained a cached image; browser-tab suspension prevented a fresh final capture. The final conflict corrections are confirmed by native shape data and bounds, without a fresh PNG confirmation.

This is a sampled native-design review, not a full-surface pass. Application runtime behavior and accessibility have not been certified. HTML/CSS detector checks do not apply to this Penpot artifact.
