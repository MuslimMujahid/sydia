3. Choosing **Tambah berkas dan folder** opens the file-library selector.
4. The user selects a file and a folder, then confirms with **Tambahkan (2)**.
5. The composer reads `Compare [Budget.pdf] [Project documents]`, with each bracketed item represented as an inline chip.
6. The user continues typing, opens **Tambah catatan**, selects a note, and sends the message.
7. The accepted message retains the ordered references. The composer clears after successful send.
8. The assistant retrieves relevant evidence from the chosen sources and answers the request.

## Existing boundaries and compatibility

- [Files and folders](./FILES_FOLDERS_SPEC.md) defines the Files hierarchy, ownership, paginated browse/search, and permanent deletion. This feature adds explicit message-scoped folder sources; it revises the earlier exclusion of folder-based assistant scope only for folders deliberately selected in a message. Merely organizing or opening a folder does not scope a conversation.
- [Notes workspace](./NOTES_WORKSPACE_SPEC.md) defines custom notes, daily notes, hierarchy, Trash, and canonical identities. Files folders and Notes folders remain separate hierarchies.
- [Notes in chat](./CHAT_NOTES_SPEC.md) defines the existing drawer, autosave guard, active-note targeting, and note citations. Source selection must integrate with those contracts without turning selection into an edit request.
- Existing device uploads, processing, retries, and Ask in chat entry points must continue working.
- The regular Web chat composer and the isolated development `/chats` preview composer are distinct. Do not let sandbox previews access real account sources.

## Proposed implementation defaults

These are recommendations for completing the contract, not separately confirmed interview decisions.

### Composer and menu

- Use structured, ordered text/reference segments as the composer model. Keep canonical identities separate from display labels; do not derive a source identity from its name or parse rendered HTML as authority.
- Preserve the insertion location while a dialog has focus. Confirm replaces the triggering `@` with chips and restores composer focus after them; cancel preserves the original draft and restores focus.
- Use the existing composer typography and spacing. Chips wrap with text and expose accessible type, label, and removal controls.
- An open menu consumes navigation/selection keys before composer send handling. Enter must never select a menu action and send the message simultaneously. Respect IME composition and existing desktop/mobile Enter behavior.
- Keep names and paths distinguishable when different sources share titles.

### Selectors

- File dialog: breadcrumb navigation, paginated file/folder rows, global name search, selection count, Cancel, and **Tambahkan**. Folder navigation and folder selection use distinct controls.
- Notes dialog: custom and saved daily notes, search, custom-note paths, localized daily dates, selection count, Cancel, and **Tambahkan**.
- Preserve selection by canonical identity while search results and folders change. Loading and errors must not silently clear selections.
- Keep management actions such as uploading, creating, renaming, moving, and deleting in their existing surfaces.
- Use the established dialog primitives and responsive conventions. Support keyboard operation, visible focus, meaningful labels, and focus restoration on confirm/cancel.

### Backend and assistant integration

- Extend both streaming and queued sends with typed source references and ordered segments. Keep existing plain-text send clients compatible.
- Persist identities, reference ordering, display snapshots, and resolved folder membership with the accepted user message. Include source identities and ordering in send idempotency checks. Do not expand a folder again when retrying the same accepted message.
- Resolve folder membership on the server with a consistent hierarchy view. Persist large memberships outside the inline prompt; use bounded retrieval over that fixed set. Never truncate membership silently.
- Validate ownership, canonical identity, current availability, and effective account scope at acceptance and before reading content. Client labels, paths, counts, and cached records are not proof of access.
- Source selection provides reading context, not a mutation request. Explicit user instructions govern any writes, using existing tools and concurrency controls.
- Reuse established file and note citations for evidence actually read and used. A selected source is not automatically a citation; folder evidence cites the contributing files.
- Historical message labels remain historical through renames and moves. Resolution uses the original canonical identities and current access checks.

## Questions still to resolve

Ask one at a time and update this document as decisions are confirmed.

1. Unavailable sources: block sending, or allow explicitly proceeding with remaining sources?
2. Content freshness: current saved content at execution, or immutable content snapshots?
3. Interaction with an open note drawer and ambiguous requests involving several selected notes.
4. `@` trigger boundaries, literal text, cancellation, and an optional visible source-menu trigger.
5. Repeated references, ancestor/descendant overlap, and source-count or expansion limits.
6. Source-only messages and behavior for empty folders or files still processing.
7. Chip activation and sent-message source interactions.
8. Final acceptance criteria and implementation validation.

## Initial acceptance criteria

- Both actions open the correct selector and insert only confirmed selections at the saved cursor position.
- Multiple selections survive browsing and searching; cancel leaves the message intact.
- A folder contributes all descendant files once to retrieval, even if a file is also directly referenced.
- Adding a note inserts its reference without opening or modifying it.
- Successful sends clear the composer; failed sends preserve text, references, and retry identity.
- Retrying an accepted folder message after a new file is added excludes that new file. A new message can include it.
- Selected sources receive priority. An explicit sources-only instruction prevents outside evidentiary retrieval.
- A renamed or moved item resolves by identity. A deleted or foreign-owned source is never read or replaced by a similarly named item.
- Existing upload, active-note save, queued/streaming send, conversation history, and sandbox isolation behavior remain covered.

## Implementation areas to verify before coding

| Area                         | Existing entry points                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Composer                     | `apps/frontend/src/components/chat/chat-composer.tsx` and its regular chat-page callers.                                          |
| Client send contracts        | `apps/frontend/src/lib/services/api/conversations/conversations.api.ts`.                                                          |
| Browse/search                | Existing file-library endpoints and Notes workspace queries; verify scale and pagination before reusing them.                     |
| Note drawer integration      | `apps/frontend/src/components/chat/chat-notes.tsx` and the chat-page send/save guard.                                             |
| Request validation           | `apps/backend/src/modules/conversations/dto/conversation.dto.ts` and `conversations.controller.ts`.                               |
| Durable messages and retries | Conversation repository, message schema, accepted-run persistence, and retry path; inspect before choosing storage details.       |
| Context and retrieval        | `apps/backend/src/modules/conversations/services/context-builder.service.ts`, tool selection, and file/note retrieval boundaries. |
| Rendering and evidence       | Existing user-message rendering and assistant file/note entities and source footer.                                               |

The source scan confirms existing `attachmentIds` and `activeNoteRef` contracts. Neither alone represents ordered mixed file/folder/note references; the final design needs an additive durable contract.

## Implementation decisions

- Confirmed: unavailable sources block sending and preserve the draft.
- Current saved content is read at execution; accepted folder membership remains fixed on retry.
- A whitespace/start-of-draft `@` opens the menu; Escape or cancel retains the literal text.
- Sources are read context. An open note retains its existing autosave guard; ambiguous multi-note writes need clarification.
- Repeated references retain their positions; document retrieval deduplicates overlapping membership.
- Source-only drafts can be sent. Empty folders contribute no evidence; directly selected processing files are disabled until ready.
- Chips can be removed in the composer. Historical chips are display snapshots.
