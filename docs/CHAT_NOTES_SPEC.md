# Notes in chat: smart references and editable drawer

Status: product decisions agreed through a design interview; implementation defaults are identified separately below. Implementation evidence and reproduction commands are recorded in [Chat notes verification](./CHAT_NOTES_VERIFICATION.md).

Date: 18 October 2026.

Design handoff: [Sydia · Chat · Notes in Penpot](https://penpot.muslimmujahid.com/#/workspace?team-id=2d1268b1-32bc-808d-8008-c8176b8b63f5&file-id=4a7e6716-c5b5-8080-8008-c936c7a3dabc&page-id=c049c5a2-ec1d-805e-8008-cee9ecb271b2). The separate page contains six desktop boards, six mobile boards, and one supporting-state board. Seven prototype flows cover normal navigation, failed saves, competing edits, and unavailable notes. Text editing, autosave, and resolution outcomes are design simulations; comparison screens show the differing section rather than the complete scrollable document. Existing Penpot pages are preserved.

## Purpose

Let a user open a note mentioned by the assistant, read and edit it beside the conversation, and ask the assistant to work on that same note without navigating away from chat.

The motivating example is an assistant response listing **Keputusan desain** as ordinary text. Its title should instead render as a compact note chip, comparable to the existing task chips. Activating it opens the note editor on the right.

This extends the [Notes workspace specification](./NOTES_WORKSPACE_SPEC.md). Existing note storage, ownership, rich-text documents, daily-date addressing, Trash rules, and conflict checks remain authoritative.

## Agreed product decisions

| Area               | Decision                                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Note types         | Support custom notes and daily notes in the first version.                                                                                                                               |
| Opening            | Clicking a note chip opens a right-side editor, ready to edit. There is no initial read-only mode or Edit button.                                                                        |
| Fields             | Custom notes have an editable title and body. Daily notes have an editable body and fixed date.                                                                                          |
| Saving             | Autosave with visible saving, saved, and failure states and a retry action.                                                                                                              |
| Desktop            | Keep chat usable beside the open editor.                                                                                                                                                 |
| Mobile             | Use a full-screen editor; returning restores the conversation and its scroll position.                                                                                                   |
| Concurrent edits   | Refresh automatically when there are no unsaved edits. Otherwise retain the local draft, pause autosave, and offer version comparison and an explicit choice.                            |
| Drawer scope       | Focus on editing, with **Open in Notes** for the full workspace. Folder management and Trash actions stay in that workspace.                                                             |
| Leaving the editor | Closing or switching waits for pending saves. A save failure keeps the draft open and offers Retry or explicit Discard changes.                                                          |
| Older messages     | Open the latest saved content of the same note, including after a rename or move. Chat text remains unchanged. Historical version browsing is outside this feature.                      |
| Assistant context  | While a note is open, “this note” refers to it. Save pending edits before sending; read current saved content before an assistant edit. Explicitly naming another note takes precedence. |

## Implementation defaults

The following details complete the specification using existing product conventions. They were not separate interview decisions.

### 1. Note references in assistant responses

- Use a compact inline chip containing a note icon and the title, or a localized absolute date for a daily note. Use existing chip sizing, typography, focus treatment, and semantic color tokens. A note must remain distinguishable from a file or task without relying on color.
- Keep surrounding prose, folder paths, excerpts, and timestamps in their normal message layout. Do not turn every note result into a large card or repeat its body inside the chip.
- Notes mentioned by successful browse, search, read, create, or update tools are eligible. Both custom-note and daily-note tools participate. Folders, trashed items, failed mutations, and absent daily-note reads do not become active note chips.
- Only completed, validated tool results belonging to that assistant reply may establish a reference. Opening a chip performs a fresh owner-scoped read; its tool snapshot is not the editable source of truth.
- Prefer explicit identity-bearing references, extending the existing task-reference mechanism. Proposed Markdown form: `[Keputusan desain](#note/custom%3AID)` and `[18 Okt 2026](#note/daily%3A2026-10-18)`. Encode the entire canonical note reference once; validate and decode it at the renderer boundary.
- A reference is interactive only when its decoded identity matches a confirmed note record from that reply. Invalid or unconfirmed internal references render their label as ordinary text and emit the existing completed-response diagnostic. Never expose a fabricated internal link.
- For older replies with usable tool records but no explicit note links, allow unique-title matching using the current entity renderer rules. Duplicate custom titles must not guess a destination; new responses use explicit references and show folder paths when distinguishing results. Daily-note prose may remain plain text when its date label cannot be matched safely.
- Never enrich code blocks, inline code, or unrelated external links. Preserve surrounding Markdown emphasis and lists.
- Deduplicate by canonical note reference within a reply, retaining the latest confirmed metadata. A successfully created or edited note omitted from the assistant's wording gets an appended chip, matching existing entity behavior. Read-only results are not all appended automatically.
- Streaming text may appear before tool records arrive. Add interactivity when confirmation becomes available, without guessing identities or issuing premature diagnostics.
- New and historical chips retain their message-time label; the drawer shows the current title and content. Saving or renaming a note does not rewrite archived chat wording.
- Opening a note requires a user action. Assistant creation or editing does not automatically open the drawer or replace a note the user is already editing.

### 2. Identity and data contract

Use the existing canonical identities:

| Kind   | Canonical reference  | Save concurrency token                       |
| ------ | -------------------- | -------------------------------------------- |
| Custom | `custom:<item-id>`   | Item revision                                |
| Daily  | `daily:<YYYY-MM-DD>` | Exact `updatedAt`, or null for an empty date |

Daily identities are local calendar dates in the account timezone, not UTC instants or database row IDs. A custom note keeps its identity through renames and moves. Never recreate a missing custom note by title or redirect an inaccessible reference to a different note.

Normalize confirmed tool output into a small note entity: canonical reference, note kind, display title/date, available path and update/version metadata, invocation observation time, and whether the result represents a successful mutation. Full document content belongs in the fetched note, not in the chip contract.

Tool results currently have different shapes: workspace search uses `notes` containing canonical references; daily search uses dated hits; daily reads report `found`; daily writes return `date`, `written`, and `noteId`. Normalize those actual contracts explicitly. Do not force every note tool through an assumed `{ id, title }` shape. If additive normalized metadata is needed, preserve existing output fields and channel behavior.

Restoring an original custom note from Trash makes its original reference usable again. A daily reference addresses that calendar day even if its stored row was cleared and later recreated.

### 3. Drawer composition and navigation

- One selected note and one editor per chat. Repeated activation of the selected chip focuses the existing drawer; another chip requests a guarded switch.
- Header: note identity/context, a quiet save indicator, **Open in Notes**, and a labelled Close action. The editor contains the custom title or fixed daily heading, the existing formatting toolbar, and one continuous rich-text document.
- Reuse the existing Notes visual language and Tiptap document/extensions. Preserve headings, lists, links, code, formatting marks, and internal `noteLink` target identities. Do not flatten the document to text or introduce a second persistence format.
- Keep existing note-link authoring and backlinks available without adding another navigation column. Resolved links and backlink destinations switch the same drawer after the save guard. Unresolved-link creation stays an explicit action using existing workspace destination rules.
- **Open in Notes** first completes the save guard, then navigates to the existing workspace route for this exact reference in the current tab.
- On desktop, use a nonmodal side panel with independent chat/editor scrolling and no backdrop. Reflow the conversation to keep its composer usable. Do not obscure messages beneath the panel.
- Initial sizing default: reserve at least 360 px for chat and 480 px for the editor, with the editor capped at 640 px. Use the available content width after application navigation; below the space needed for both columns, show the full-screen editor. Resizing is outside the first version.
- On compact screens, replace the split layout with a full-screen editor and a Back action. Preserve the chat composer draft and scroll position while it is covered. Returning must not reload or reset the conversation.
- Opening focuses the panel heading or labelled container; the writing surface is editable immediately without forcing the mobile keyboard open. Keyboard users can reach every editor and header control. Desktop focus can move between chat and panel; the full-screen presentation manages focus within its visible surface.
- Close/Escape on the drawer use the save guard and restore focus to the originating chip where possible. Escape first closes an active editor menu, link picker, or comparison surface. Clicking chat does not dismiss the desktop panel.
- Selecting another conversation, starting a new chat, or leaving the chat route uses the same save guard and clears active-note context after navigation. Drawer state is scoped to the current chat and is not automatically restored after a page reload in this version.

### 4. Autosave and leaving safely

Reuse the existing workspace editor/autosave contract, including its 800 ms debounce and serialized writes. Refactor shared pieces where necessary rather than maintaining a separate drawer implementation of note persistence.

| State          | User experience                                        | Leaving or sending with note context                                                                   |
| -------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Loading        | Quiet editor skeleton; chat remains usable             | Closing is immediate; there is no active note context until loading succeeds                           |
| Saved          | Small Saved indicator                                  | Continue immediately                                                                                   |
| Dirty / saving | Saving indicator; editor remains usable                | Flush and await all pending writes                                                                     |
| Save error     | Persistent unsaved notice and Retry; retain the draft  | Keep the requested action pending until Retry succeeds or the user explicitly discards unsaved changes |
| Conflict       | Autosave paused; retain draft; Compare versions action | Resolve the conflict or explicitly discard local changes before continuing                             |

The guarded actions are Close/Back/Escape, switching notes, following note links, Open in Notes, changing conversations, route navigation, and sending a message with the active note attached. They must share one guard rather than relying only on route blocking.

- **Retry** retries the latest draft against the appropriate baseline. It must not replay a stale write over a known newer version.
- **Discard changes** explicitly abandons only unsaved local edits and completes the requested action. It never deletes already saved edits or rolls back earlier autosaves. In a pending send, reload the current saved note before attaching its context.
- Preserve the pending chat message, attachments, and send identity when saving prevents a send. Do not dispatch a partial chat request or silently omit the active note.
- Guard browser reload/tab closure when unsaved work remains using the existing browser unload mechanism. Draft preservation is guaranteed while the mounted editor is retained; durable recovery after a forced browser/process termination is not promised in this version.
- An empty custom body remains a saved custom note. Clearing a daily body follows existing daily-note clearing semantics; the open date can remain an empty editor and accept subsequent writing. Saving an invalid custom title retains the draft and displays the server validation error.
- Save and load failures stay visible at the affected editor, with an actionable retry where appropriate. Diagnostics identify the operation and reference without logging note bodies.

### 5. External changes and conflict resolution

- Fetch latest content when opening. Reuse note queries and their existing five-second refresh behavior while open, refresh on focus/reconnect, and invalidate relevant queries immediately after confirmed note mutations in chat.
- A remote update replaces a clean editor's content and current metadata. Avoid refocusing the editor or moving the conversation scroll position.
- If local edits are dirty or a save is in flight, reconcile through serialized writes and server version checks. Do not mark a local draft as saved merely because a refetch completed.
- On a competing update, preserve the local rich-text draft and stop automatic writes. Reuse the comparison flow with explicit **Use latest saved version** and **Keep my draft** actions.
- Choosing the saved version discards unsaved local edits. Choosing the draft writes it only against the version the user actually compared. If the note changes again, require a new comparison rather than silently approving another overwrite.
- No live collaborative merge, CRDT, automatic text merge, or per-character AI streaming into the editor is required.

### 6. Active-note context for the assistant

Show one compact **Editing: <note title/date>** context indicator by the chat composer while the drawer has a successfully loaded, accessible note. Use localized copy and avoid adding duplicate content or a full preview. Closing the drawer removes this context from future sends.

Send flow:

1. Capture the selected canonical reference when Send is activated and run the shared save guard. Hold the composer message and disable duplicate dispatch while it completes.
2. Attach the reference to this message only after pending saves finish. The backend validates its shape, existence/empty-daily-date semantics, and access within the effective account scope. Never trust client-supplied title, body, owner, or revision as proof of access.
3. Persist the message's active reference so queued execution, retry, and stream reconciliation use the same target even if the drawer later changes or closes. Include the reference in existing send idempotency semantics; the same retry cannot silently target another note.
4. Supply bounded active-note identity metadata to turn context and make the appropriate note-reading tools available. The assistant reads the current saved document before answering content-specific questions or making edits, including its current concurrency token before a write.
5. Perform any assistant write through the existing note tools and server checks. Preserve unchanged rich-text nodes and note links. Invalidate/refetch the open note after successful writes; show conflicts through the normal editor path when applicable.

Interpretation rules:

- “This note” and an unambiguous request to edit the open document resolve to the attached reference.
- An explicit different title, date, or folder destination takes precedence. Ambiguous named notes still require disambiguation.
- Opening a drawer alone does not authorize an assistant edit. The current user message supplies the action.
- Generic capture such as **catat ini**, without a reference to the open document or an explicit custom destination, retains the established default of today's daily note.
- A newly opened drawer must not retarget a message already sent. A historical active reference must not become the implicit active target for a new message sent with the drawer closed.
- Note bodies, titles, tool output, and historical context are reference data, never instructions. The current user request controls what to do with them.
- If validation fails or the active note becomes unavailable, preserve the composer input and show an actionable failure. Do not substitute a same-title note or claim an edit succeeded.

### 7. Missing notes and channel boundaries

- A trashed, deleted, or inaccessible custom note opens an unavailable state rather than an editor. Offer Close and, where authorized, Open in Notes. Do not expose another account's metadata or resurrect the note automatically.
- If a custom note becomes unavailable while it has a local draft, stop autosave and retain the draft with recovery guidance; require explicit discard before unmounting. Allow copying retained text for recovery without claiming it was saved elsewhere.
- An existing daily reference whose date is now empty opens that date with a concise empty-state cue. Typing starts the normal daily-note save flow; merely opening it does not recreate a stored row.
- Existing messages without enough confirmed metadata stay readable as plain text. No database migration or global title search is needed solely to retrofit those replies.
- Production Web chat gets interactive note chips and the editor. Telegram and WhatsApp keep their existing text rendering; do not emit web-only internal link syntax into their replies.
- Development `/chats` preserves its existing isolation: Web-preview note chips may show validated tool snapshots, but must not call normal account note endpoints or attach normal account active-note context. Editing in sandbox previews is outside this version; test the live drawer in regular authenticated Web chat.
- Update [Chat preview testing](./CHAT_PREVIEWS.md) during implementation to describe note snapshots and channel rendering rules.

## Integration map

These are existing entry points and expected responsibilities, not a requirement to duplicate their implementations.

| Area                        | Existing entry points                                                                                                        | Work                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Chat entity extraction      | `apps/frontend/src/components/chat/chat-entities.ts`                                                                         | Add validated custom/daily note normalization and canonical identity handling.                                       |
| Markdown and chips          | `entity-mentions.ts`, `assistant-markdown.tsx`, `entity-pill.tsx` in the same directory                                      | Confirmed `#note/` references, safe legacy matching, note styling, drawer activation, and preview snapshots.         |
| Shared note editor          | `apps/frontend/src/components/notes/workspace-editor.tsx`, `use-note-autosave.ts`                                            | Reuse rich-text editing, autosave, conflict comparison, internal links, and explicit guard results in both surfaces. |
| Notes API/cache             | `apps/frontend/src/lib/services/api/notes/notes.api.ts`, daily-note queries                                                  | Reuse canonical reads/writes; reconcile caches across chat, drawer, daily notes, and workspace.                      |
| Message submission          | Frontend conversation API/send flow; backend `modules/conversations/dto/conversation.dto.ts` and its request-to-run pipeline | Optional active reference, validation, persistence, idempotency, and retry continuity.                               |
| Turn context                | `apps/backend/src/modules/conversations/services/context-builder.service.ts` and note tool selection                         | Message-scoped active identity, fresh reads, explicit-target precedence, and no historical target leakage.           |
| Tool results and formatting | `notes-workspace-tools.ts`, `daily-note-tools.ts`, and channel prompt/response formatting                                    | Confirmed note metadata and Web identity references without changing messaging-channel output.                       |

The current `ChatEntity` union contains tasks, reminders, files, and events; notes must be added. The current message DTO has no active-note field, so drawer-aware assistant behavior requires backend work as well as UI work. Persistence/schema needs for message-scoped context must be determined through the actual conversation storage path before implementation; do not assume this can be held only in React state.

## Delivery sequence

1. Establish canonical note entity normalization and active-reference contracts, including message persistence and scope validation.
2. Add note entity extraction and confirmed Web references, with parser regression tests and channel formatting checks.
3. Extract/reuse editor pieces and implement the one-note drawer, responsive presentation, focus behavior, and guarded exits.
4. Connect save guards, active-note send context, fresh assistant reads, mutation invalidation, and conflict reconciliation.
5. Verify regular Web chat, existing Notes workspace behavior, historical replies, and isolated `/chats` previews; update the relevant documentation.

## Acceptance checks

1. Asking whether **Keputusan desain** exists yields a clickable custom-note chip; clicking it loads current content in an immediately editable drawer.
2. Reading, finding, creating, or writing a daily note can yield a date chip that opens the correct local calendar date with no editable date field.
3. Creating or editing a note yields an appended chip when the assistant omits its title. Folder-only, failed, absent, and unconfirmed results do not yield active chips.
4. Two notes with the same title in different folders each open correctly through explicit identity references. Ambiguous legacy title text never opens an arbitrary one.
5. An old chip still opens its original note after a rename or move and displays current content; archived message wording stays unchanged.
6. Rich-text formatting and internal link targets survive manual editing, autosave, assistant editing, and reopening in the workspace.
7. Desktop users can continue reading and sending chat messages while the note is open. Compact-screen users return to their unchanged chat draft and scroll position.
8. Rapid edits and switches do not write one note's draft to another. Close, note links, workspace navigation, and chat navigation wait for pending saves.
9. A failed save keeps the draft and pending action available. Retry succeeds without losing newer keystrokes; explicit Discard changes abandons only unsaved edits.
10. A clean editor refreshes after an assistant/external update. A dirty editor preserves its draft and offers comparison. A third concurrent update requires comparison again.
11. With a note open, **“Summarize this note”** reads that note, and **“Add this decision to this note”** saves local edits first and edits the same canonical target.
12. Explicitly naming another note overrides drawer context; a generic **catat ini** still targets today's daily note. Opening a note without a user edit request causes no assistant mutation.
13. Save/conflict failure prevents dispatch of a message with stale note context and retains its text/attachments. Retrying an already accepted message preserves its original target after the drawer switches or closes.
14. A closed drawer contributes no new active reference; old message metadata cannot silently reactivate it. Cross-owner references and mismatched preview scopes fail without leaking note data.
15. A missing custom note is not recreated or replaced by a same-title note. A cleared daily date opens empty and is stored only after editing.
16. Keyboard opening, toolbar use, note switching, comparison, Escape, and focus restoration work on desktop and mobile. Accessible state announcements remain concise; errors are not toast-only or color-only.
17. Telegram and WhatsApp retain readable channel-native text. `/chats` Web preview renders only sandbox tool snapshots and performs no live drawer reads/writes.

## Verification plan for implementation

Apply the repository testing skills when implementing behavior. Extend the existing entity parser/extraction tests and backend note/context tests. Add a focused drawer browser spec and deterministic autosave/guard tests using controlled timers and request boundaries. Add the new `note-drawer.spec.ts` to the explicit `testMatch` allowlist in `playwright.entities.config.ts` and supply its fixture entry. Test returned document content, target identity, revision handling, and prevented dispatch; a screenshot or a generic “request succeeded” assertion alone is insufficient.

Planned focused commands (the new test files must be added and discovered by these configurations during implementation):

```sh
# apps/frontend
bun test src/components/chat/chat-entities.test.ts src/components/chat/entity-mentions.test.ts
bunx playwright test --config playwright.entities.config.ts note-drawer.spec.ts entity-renderer.spec.ts chat-previews.spec.ts --workers 2
bunx playwright test --config playwright.config.ts notes-workspace.spec.ts notes-navigation.spec.ts
bun run check-types
bun run build
```

```sh
# apps/backend
bun run test --runInBand daily-note-tools notes-workspace-tools context-builder conversation.dto assistant-orchestrator
bun run test --runInBand prisma-chat-preview.repository.spec terminal-tool-response.spec telegram.adapter.spec
bun run check-types
```

Add targeted commands for new autosave/guard and message-context persistence tests and verify that they discover and run them. Reproduce the plain-text note reference in a regression test before implementing note enrichment, then demonstrate that the fix changes its result.

Manually run authenticated frontend/backend development mode and check regular Web chat plus all three local `/chats` previews, using **New session** and **Raw response** as described in the existing preview guide. Include populated custom and daily notes, duplicate titles, a long note, a failed write, an external edit, a missing note, desktop, and compact-screen layouts. No actual Telegram or WhatsApp delivery is needed to verify this feature.

## Outside the first version

- Drawer folder trees, move/Trash/restore controls, or a second full Notes workspace embedded in chat.
- Historical note version browsing, automatic merging, collaborative editing, or character-by-character AI document streaming.
- Multiple open drawers, editor tabs, user-resizable panels, or persistent drawer deep links/restoration.
- Durable offline draft synchronization or guaranteed recovery after forced process termination.
- Interactive native Telegram/WhatsApp note drawers or live sandbox-preview editing.

No product question from the interview remains blocking. The explicitly labelled defaults can be adjusted during implementation while preserving the agreed behavior.
