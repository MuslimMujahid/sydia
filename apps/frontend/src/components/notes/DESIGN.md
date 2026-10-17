---
name: "Sydia Notes workspace"
description: "The Notes surface within the existing Aurora Haze system."
colors:
  ink: "#171419"
  ink-muted: "#6b6470"
  brand: "#ef5a8a"
  warm-background: "#fbf8f5"
  writing-surface: "#ffffff"
  divider: "rgba(23, 20, 25, 0.08)"
typography:
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
  navigation:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
  mobile-inline-input:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
rounded:
  sm: "10px"
  md: "16px"
  lg: "22px"
spacing:
  mobile-inset: "24px"
  wide-inset: "48px"
components:
  button-primary:
    textColor: "{colors.writing-surface}"
    rounded: "{rounded.md}"
    padding: "12px 22px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 22px"
  editor-toolbar:
    backgroundColor: "{colors.warm-background}"
    rounded: "{rounded.md}"
---

# Design System: Sydia Notes workspace

## Overview

**Creative North Star: "Aurora Haze"**

This document records the implemented Notes surface in **Operate** mode. It extends the existing identity: warm contextual navigation, a flat white writing area, Inter typography, and the original grainy Aurora primary button. The main task is to open, write, and organize one note while retaining its folder or daily-date context.

The [root design system](../../../../../DESIGN.md) remains the visual authority. Product behavior comes from the [Notes specification](../../../../../docs/NOTES_WORKSPACE_SPEC.md); composition and interaction intent come from the [Notes design handoff](../../../../../docs/NOTES_WORKSPACE_DESIGN.md). This is a local implementation record, not a new global identity or replacement for those documents. The paired `.impeccable/design.json` contains local component specimens and responsive metadata.

**Key Characteristics:**

- Warm navigation beside one flat white editor.
- Persistent folder/date context and quiet save feedback.
- Dark underlined note links and backlinks after the document.
- A dedicated mobile navigation sheet with touch-sized folder controls.

Evidence: current Notes components, shared editor typography, shared UI primitives, and `src/styles/globals.css`, plus the final custom-note captures at `.impeccable/review/desktop.png` (1440 × 1000), `mobile.png` (390 × 844), and `mobile-navigation.png` (390 × 844), relative to the repository root. These captures sample a populated custom note and its navigation; they do not certify every daily, search, linking, Trash, conflict, loading, error, or keyboard state. Other controls described below are implementation facts, not claims of screenshot coverage.

## Colors

Use the existing CSS semantic tokens; the frontmatter records their current values rather than creating another runtime palette.

- **Ink:** title, document text, note-link labels, and outline-button labels.
- **Muted ink:** paths, timestamps, supporting descriptions, and save status.
- **Brand:** the selected tree tint, selected note icon, and focus indication. Selection uses a light transparent tint rather than filling the writing surface with accent color.
- **Warm background:** contextual sidebar, workspace header, and compact formatting toolbar.
- **Writing surface:** the editor and mobile navigation sheet.
- **Divider:** structural boundaries, editor navigation, backlinks, and footer.

The primary button uses the existing `--aurora-gradient` and `--shadow-button`. Retain that asset rather than constructing another gradient from these surface tokens.

## Typography

Inter carries the title, document, navigation, controls, and metadata. Code content inherits the shared JetBrains Mono treatment.

- **Title:** the frontmatter role is the narrow-screen size; it becomes 34 px from 640 px upward. A custom note uses a visibly editable textarea with the accessible name **Judul catatan**, plus a hidden page heading. Enter moves into the document. A daily note uses a date heading.
- **Body:** shared rich-text typography supplies paragraph rhythm, lists, headings, quotes, and code. The Notes editor overrides the inherited card insets and maximum text width to fit this flat writing surface.
- **Navigation:** tree labels use 13 px text; the selected label becomes semibold. Long labels truncate in the tree while the full title remains in the document.
- **Metadata:** the label role supports updated time, context path, save state, and incoming-link counts.

## Layout

At desktop widths (1024 px and above), preserve the application shell's 272 px navigation column. The Notes header is 80 px high. A 280 px contextual sidebar sits beneath it, followed by one editor with a 64 px navigation bar. The writing wrapper is at most 824 px wide, including 48 px horizontal insets, leaving a maximum 728 px writing measure. The document region scrolls while the workspace navigation remains available.

Below 1024 px, the global shell supplies its compact header and the Notes workspace uses a 64 px action header. The contextual sidebar is replaced by a modal navigation sheet opened by **Buka navigasi catatan**. The same search, daily entry, folder hierarchy, and Trash controls are reused there; opening a note closes the sheet. The writing inset is 24 px below 640 px and 48 px above it. Keep title wrapping, compact formatting controls, and one continuous document column.

The formatting toolbar stays at the top of the editor's scroll region. Incoming links follow the document in an initially open native disclosure; they can be collapsed on either screen size. Backlink paths are hidden below 640 px. The footer follows the document and uses a minimum 44 px height.

## Elevation & Depth

The document is flat: spacing, warm/white contrast, and hairline dividers establish structure. There is no enclosing editor card or persistent backlinks column. The Aurora button retains its shared shadow. Dialogs and sheets inherit the existing UI primitive treatments; this surface adds no independent shadow or motion system.

## Shapes

Use the existing gentle radii: small navigation/field corners, medium toolbar/button corners, and the shared sheet shape. The editor itself remains edge-to-edge white within its column. The nested hierarchy uses subtle vertical guide lines and indentation rather than cards.

## Components

### Workspace actions

**Catatan baru** is the primary Aurora action. It creates a custom note in the selected folder and focuses its placeholder title; creation has a visible pending state and is unavailable while workspace data is loading or failed. **Hari ini** uses the shared dark-outline variant and opens the current daily note.

### Contextual navigation

Search sits above the dedicated daily-note entry, followed by the separate custom folder hierarchy. Daily mode expands the existing date navigator. Custom folders sort before notes, alphabetically. Tree rows have a 4 px gap, including between a parent and its first child. Folder expansion and folder selection are separate native buttons; expansion exposes `aria-expanded`, and selected entries expose `aria-current`. Opening a document highlights that document alone; its parent remains the destination for new items without receiving an active treatment. A folder receives the active treatment when its contents view is open. Folder expansion controls are at least 44 × 44 px below 640 px; they compact at wider widths. Mobile note actions and new-folder controls also retain 44 px minimum dimensions. Icons supplement text or have accessible names.

The item menu exposes rename, move, note-link copying, and a distinct destructive Trash action. Dragging changes the parent; **Pindahkan ke…** supplies the destination-picker path. Trash remains at the bottom of contextual navigation.

The calendar and folder tree share one vertical scroll region with horizontal overflow contained. A thin, muted scrollbar uses a transparent track, becomes more visible on hover or focus, and reserves a stable gutter. Forced-colors mode uses the system scrollbar colors. Calendar month controls stay within the available width; Search and Trash remain outside the scrolling region.

**Folder baru** inserts one editable row at the start of the destination branch and reveals collapsed ancestors. The destination is the browsed folder or the open document's parent; root documents and daily notes use the root. The default name **Folder baru** is selected for replacement. Enter (keyboard Done on mobile) creates; Escape cancels and returns focus to the trigger. Leaving the field saves a trimmed, nonempty name; leaving an empty name cancels. Keep the existing document open throughout. The field uses a 6 px radius, folder and chevron icons, 13 px desktop text and 16 px mobile text. The destination and keyboard instructions are available to assistive technology rather than repeated as visible form copy.

While creating, retain the row with a read-only name, loading icon and accessible status. Failed creation preserves the name, returns focus to the visible input and displays an associated alert; Enter retries. A shared draft and mutation serve the desktop sidebar and mobile drawer, and retries reuse the creation request key to prevent duplicate folders after a lost response. Opening mobile navigation focuses its heading so it preserves document context; Search activates when explicitly focused.

### Editor and links

The document exposes a multiline textbox named **Isi catatan**. The shared compact rich-text toolbar is reused, with a note-link control. Toolbar buttons grow to at least 44 × 44 px below 640 px. Link labels remain dark and underlined. `[[` and **Tautkan catatan** open the existing link picker, where titles are paired with paths. Creation is an explicit action. Backlinks use a native `details`/`summary` disclosure and navigable rows after the document.

### Search and dialogs

Search results show title, path, and a limited excerpt, with labelled note-type and folder selects. Empty, loading, and failed results are explicit. Move, rename, restore, deletion, and version comparison reuse shared dialog primitives rather than adding another panel to the writing layout. Conflict comparison uses two columns from 640 px and stacks on narrow screens. The link picker uses the shared sheet variant.

### Save feedback and recovery

Header and footer save messages each use their own valid inline polite status region. Saved state includes a checkmark; conflict/error header states use a warning icon and words. A conflict pauses autosave, preserves the local draft, and exposes **Bandingkan versi**. The comparison presents local/server text and source context with explicit resolution actions. Failed saves and failed queries expose alerts and retry controls.

Navigation remembers the last-opened note in user-scoped browser storage; a direct destination takes priority. Missing stored custom notes return to today with a visible notice. Storage failure produces a visible warning and keeps navigation in memory for the current session.

## Do's and Don'ts

### Do

- **Do** preserve the root Aurora Haze identity and shared semantic tokens.
- **Do** keep the folder/date context visible above one writing surface.
- **Do** keep backlinks after the document and navigation available in the mobile sheet.
- **Do** retain visible focus, native buttons, labelled fields, explicit save states, and the mobile folder expansion target.
- **Do** distinguish implementation facts from the limited screenshot sample when reporting verification.

### Don't

- **Don't** introduce a new visual world, decorative motion, or global token changes through this local document.
- **Don't** wrap every section in a card or add a fourth persistent column for backlinks.
- **Don't** replace dark underlined note-link labels with accent-only text.
- **Don't** make dragging the only way to move an item or make typed unresolved links create notes automatically.
- **Don't** report the custom-note desktop/mobile sample as certification of the entire Notes workspace.
