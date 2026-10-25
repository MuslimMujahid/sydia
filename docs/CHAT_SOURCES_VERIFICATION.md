# Chat sources verification

Verified on 25 October 2026 against the running development frontend and backend.

## Implemented contract

- Ordered inline text, file, folder, and note references persist with accepted messages.
- Source ownership and availability are checked server-side. Unavailable sources block sending and preserve the draft, as confirmed by the user.
- Folder expansion is transactional, recursive, deduplicated, and fixed for retries. New messages resolve a new membership.
- Search and document metadata pagination stay within the fixed membership. Empty selections never widen retrieval.
- Current saved note content is read at execution. Selecting a note does not open it or authorize a write; an existing open note retains its save guard and read access.
- Existing file and canonical note citations represent evidence actually read. Historical source chips keep their display snapshots.
- Real account sources are rejected by the development chat preview sandbox.

## Automated evidence

| Check                                                                           | Result           |
| ------------------------------------------------------------------------------- | ---------------- |
| Frontend and backend TypeScript checks                                          | Passed           |
| Source resolution, phase tools, tool executor, context builder, orchestrator    | 123 tests passed |
| Queued and streaming preview source isolation                                   | 2 tests passed   |
| PostgreSQL source contracts in dedicated `sydia_chat_sources_contract` database | 6 tests passed   |
| Composer segment serialization                                                  | 4 tests passed   |
| Desktop/mobile source picker browser tests                                      | 16 passed        |
| Desktop/mobile cross-channel preview browser tests                              | 20 passed        |
| Desktop/mobile note drawer regression tests                                     | 20 passed        |

The browser checks passed across separate runs. The initial combined run exposed six outdated textarea assertions; those were adapted to the contenteditable composer, and all 20 note drawer checks then passed. PostgreSQL contracts cover 1,001-file membership, recursive overlap, replay versus new message expansion, rename/move identity, deletion, and foreign ownership.

Representative commands, run from the corresponding app:

```sh
bun run check-types
bun run test --runInBand src/database/repositories/chat-source-resolution.spec.ts src/modules/conversations/services/phase-tools.spec.ts src/modules/conversations/services/tool-executor.service.spec.ts src/modules/conversations/services/context-builder.service.spec.ts src/modules/conversations/services/assistant-orchestrator.service.spec.ts
bun run test --runInBand src/modules/conversations/conversations.controller.spec.ts
bun test src/components/chat/chat-source-types.test.ts
bunx playwright test --config playwright.entities.config.ts e2e/chat-sources.spec.ts e2e/chat-previews.spec.ts e2e/note-drawer.spec.ts
```

The PostgreSQL suite requires `CHAT_SOURCES_CONTRACT_DB_URL` pointing to its dedicated database; it deliberately refuses the ordinary application database.

## Live browser and visual evidence

Signed in normally with agent-browser. Created a synthetic folder, custom note, saved daily note, uploaded text file, and source-bearing conversations. Observed empty, loading/processing, failed-file, selected, inherited-folder, search, inserted-chip, sent-message, and working note-citation states.

The latest live note response read the selected note, displayed the correct historical chip, and opened the same note through its canonical citation. Its conversation is available at `http://localhost:3000/?conversation=cmvngdvg20000j97kywec2afg` while the local development app is running.

Penpot was inspected with MCP. Desktop 1440×900 and mobile 390×844 captures were compared against its measured dialog, menu, row, typography, chip, and footer geometry. An independent finish review matched those elements; its sole footer spacing finding was resolved on fresh captures. This is measured visual review rather than a pixel-diff certification: the Penpot plugin later stopped responding, so a fresh exported comparison image was unavailable.

Local screenshots and logs are stored under `.impeccable/review/chat-sources/` and excluded from version control. `desktop-sent-final.png`, `desktop-files-final.png`, and `mobile-files-final.png` show representative completed states.

## Environment limitation

The new text-file upload reached the existing processing failure state (`PARSER_PROCESS_FAILED`) in this local runtime. This does not prevent selecting existing ready files or testing file membership, but a successful parse of that new upload was not verified. No document parser changes are included.

## Badge fidelity correction

The final user direction supersedes the intermediate all-rose correction: source chips now match the existing note/file `EntityPill` styling through shared `ENTITY_PILL_BASE_CLASS_NAME` and `ENTITY_PILL_STYLES` exports. Notes use rose at 8% opacity with ink text; files and folders use violet-50 background and violet-800 text (current rendered values `#f5f3ff` and `#5d0ec0`). Notes use the Files icon, daily notes CalendarDays, files FileText, and folders Folder.

The shared base uses medium-weight 0.875em text, 24px line height, fully rounded corners, and 10px horizontal/2px vertical padding. Source chips retain a 28px body height, 14px icons, and 2px margins on all sides for a 4px gap between wrapped rows. Selected editor chips keep the 2px brand outline at 50% opacity; composer removal controls remain 20px with 14px icons. Historical chips share the styling without removal controls.

All 14 Penpot source chips were updated live through MCP to the final type colors and icons, retaining their 28px height and 14px corners. Current captures are `entity-source-desktop.png` and `entity-source-mobile.png` in the local review directory. These supersede the earlier `badges-*` captures for appearance. The fresh independent review returned **ship** for shared entity appearance, the 4px wrapped gap, and the updated Penpot export (`penpot-entity-badges.png`), with no material fixes. All 72 source/entity renderer browser checks passed (`entity-badges-browser.log`); frontend type checking and ESLint with zero warnings passed, and the scoped detector returned no findings. These results apply to the final revision.

## User-message note badge activation

Historical and optimistic user-message note source badges now open the existing note editor through the ChatNotes provider and canonical custom/daily reference. Opening does not request a write. Composer chips retain their existing selection/removal behavior. Added custom-note and daily-note browser regressions; the custom-note regression also asserts no write occurred on opening. Both desktop regressions failed against the non-interactive badges before the implementation was applied. Live agent-browser verification opened the selected historical custom note in the desktop sidebar. Screenshot: `user-note-sidebar-desktop.png`.

Validation for user-message note activation: frontend TypeScript and configured ESLint passed; all 40 desktop/mobile source-picker and note-drawer browser checks passed. The scoped detector had no findings. Final interaction and screenshot review ran inline because delegated finish agents were unavailable under the current usage limit.
