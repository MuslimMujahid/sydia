# Chat source selection: implemented surface

Date: 2026-10-25. Scope: the regular Web chat source menu, file/folder and notes selectors, inline composer references, and historical reference chips.

The behavior contract is [CHAT_SOURCES_SPEC.md](./CHAT_SOURCES_SPEC.md). This document records the implemented surface; it extends the incumbent Operate interface and leaves the repository-wide [DESIGN.md](../DESIGN.md) authoritative. It does not introduce a replacement visual system or a global token sidecar.

## Overview

Source selection lets users add saved context while writing a message. The chat shell, navigation, composer, brand assets, and surrounding conversation remain familiar. The picker is a temporary task surface: choose existing sources, confirm, and continue writing. File and note management stays in its existing workspace.

Bahasa Indonesia and English use the same component structure. Concise labels name the source type and action. Selected references are readable objects within the message rather than attachment management cards.

## Colors

Use the existing canvas, ink, muted ink, hairline, and brand tokens. Picker rows remain flat on the canvas; selected rows receive a restrained brand tint. Checkboxes use ink fill with a white check, while keyboard focus uses the brand accent. The backdrop uses ink at 30% opacity.

Composer and historical source chips reuse the existing entity-pill colors by type: notes use brand rose (`#ef5a8a` at 8% opacity) with ink text; files and folders use the existing violet background and text tokens. Their current Tailwind v4 rendered values are `#f5f3ff` and `#5d0ec0`. Hover follows the corresponding entity-pill treatment. This final direction supersedes the earlier all-rose badge correction and does not change the global palette.

The confirm action carries the existing warm-to-violet brand expression. Its implemented gradient is `linear-gradient(110deg, #ff8a4c, #f06694 55%, #8c5cff)`. The design detector reported these three literal colors as advisories; they are intentional scoped exceptions matching the pinned Penpot action. They do not define a new global palette.

## Typography

Inherit application font families. The selector title is 18px on mobile and 20px from the small-screen breakpoint upward. Source names and search text use 15px, secondary paths and metadata 13px, and note group labels 12px. Inline source chips share the existing entity-pill medium weight and relative text size (0.875em), with a 24px line height and a small type icon.

Names truncate when space is constrained. Paths and full chip labels remain available in the chip title. Daily notes use localized dates; custom notes retain their names and containing paths.

## Layout

The desktop picker is centered, with a 640px maximum width and a 780px target height capped by the viewport minus 64px. At the reviewed 1440 × 900 viewport, the outer dialog occupies x=400, y=60. Desktop horizontal content padding is 28px; the search field is 44px high. The measured Penpot search target was 584px wide; rendered borders and the shared dialog primitive can affect the exact inner measurement.

Below the small-screen breakpoint, the dialog becomes a full-width bottom sheet with height `100dvh - 48px`. At the reviewed 390 × 844 viewport it begins at y=48 and occupies 796px. Horizontal padding reduces to 16px. Descriptive introductory text remains available to assistive technology while hidden visually on mobile.

The header and footer remain outside the independently scrolling results region. File rows have a 52px minimum height, growing when a search path is shown. Notes have a 72px minimum height for title and context. Secondary file metadata hides on mobile. Folder breadcrumbs can scroll horizontally.

Desktop places selection count, clear selection, Cancel, and Add in one footer row. Count and clear selection have explicit separation. Mobile uses two rows: count and clear selection above Cancel and Add. The footer includes bottom safe-area padding and remains visible while browsing results.

## Elevation & Depth

Hairline dividers organize the flat source list. Shared dialog elevation and the dimmed chat shell establish the modal layer. The compact source menu uses a restrained shadow. Selection is conveyed by checkbox state and a tonal row fill rather than extra elevation.

## Shapes

The desktop dialog has rounded corners (16px); the mobile sheet rounds its top corners (16px). Search and confirmation controls use 10px corners. The compact source menu also uses 10px corners, while inline chips use fully rounded pill corners (14px at their 28px height), type-specific entity-pill fills, and no border. A selected editor chip has a 2px brand outline at 50% opacity. Checkboxes use 5px corners.

## Components

- **Source menu:** typing `@` at the start of the draft or after whitespace opens two actions: files/folders and notes. The menu spans the full outer composer width, superseding earlier fixed-width targets. It opens below the composer for an empty conversation and above it for an existing conversation, with an 8px offset and 16px corners. It uses 4px outer padding and two rows with a 36px minimum height, 8px horizontal padding, and an 8px icon/label gap. Each action has one localized label (13px text, 20px line height) and a 16px icon; subtitles are omitted. Keyboard navigation and Escape remain handled before ordinary composer submission. Desktop and mobile width measurements match the composer exactly. Local captures use the `fullwidth-menu-` prefix. This menu refinement did not update Penpot; the previous Penpot update concerned source badges. Configured ESLint and the 16 source-picker browser checks passed before the final empty-conversation direction correction; targeted keyboard checks and live direction measurements verify that correction. The delegated review was unavailable due to a usage limit, so the final layout was reviewed inline.

- **File picker:** browse folders through the separate chevron control; select through the checkbox/label. Search queries file/folder names globally and shows containing paths. Results request pages of 50, sorted by name ascending. Selection survives navigation and search. Descendants of a selected folder display as included. Processing, failed, or deleting files cannot be selected directly.
- **Notes picker:** search saved custom and daily notes, grouped by type. Custom notes show containing paths; daily notes show localized dates. Selecting a note adds reading context without opening the note editor.
- **Footer:** announce selected count politely, clear the current selection, cancel, or confirm. Confirmation is disabled with no selection. Confirmed items replace the triggering `@` at the saved insertion position and restore composer focus. Cancel preserves the draft and restores focus.
- **Result states:** loading skeletons, empty results, no search matches, and a visible load error with retry occupy the results region. A failed load retains selection. These states do not replace the footer.
- **Inline source chip:** shares the base geometry and type styling exported from `entity-pill-styles.ts` with existing `EntityPill` components: 28px height, fully rounded corners, 10px horizontal and 2px vertical padding, and a truncated label. Notes use the Files icon, daily notes CalendarDays, files FileText, and folders Folder; icons are 14px. Each source chip adds 2px margins on all sides, retaining a 4px gap between wrapped chip rows. The composer provides a 20px removal control containing a 14px icon; editor node selection adds the outline described above. Chips wrap with text and preserve structured identities and ordering. Historical message chips reuse the same pill treatment and display snapshots without the removal action.

## Do's and Don'ts

- **Do** keep folder navigation separate from source selection.
- **Do** preserve selection across browse/search changes and preserve the draft on cancellation or failed sending.
- **Do** keep the mobile footer visible and allow the results region to scroll.
- **Do** retain keyboard focus treatments, source labels, and localized copy.
- **Don't** turn this picker into a file or note management workspace.
- **Don't** treat a selected source as an assistant citation or as permission to edit it.
- **Don't** infer canonical identities from chip labels or pasted markup.

Review evidence: final captures are under `.impeccable/review/chat-sources/`, including desktop/mobile files, notes, composer and menu, plus desktop folder, search, and sent-message states. The independent review's material count/clear-selection spacing issue was corrected and recaptured; its shipping disposition applies to that sampled surface. Runtime checks and their limits are recorded separately in [CHAT_SOURCES_VERIFICATION.md](./CHAT_SOURCES_VERIFICATION.md).

The final source-chip direction matches the existing note/file entity pills and supersedes the earlier all-rose treatment and its badge captures. All 14 Penpot source chips were updated live through MCP to the same type colors and icons while retaining 28px height and 14px corners. Current captures are `entity-source-desktop.png` and `entity-source-mobile.png`. The fresh independent review returned **ship** for shared entity appearance, the 4px wrapped gap, and the updated Penpot export (`penpot-entity-badges.png`), with no material fixes. All 72 source/entity renderer browser checks passed, frontend type checking and ESLint with zero warnings passed, and the scoped detector returned no findings. These checks cover the final revision.

Not canonized: one-off viewport coordinates, fixture names/counts, and exact Penpot geometry are reference checks for this surface, not reusable global layout tokens.
