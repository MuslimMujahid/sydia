# Chat notes implementation verification

Implementation: `CHAT_NOTES_SPEC.md`. Verified in the authenticated development app with the seeded Demo User, and with deterministic HTTP-boundary browser fixtures. The database migration `20261018130000_message_active_note` adds the per-message note reference and was applied to the local development database.

## Product behavior and evidence

| Spec checks                                           | Evidence                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–3: custom/daily references and mutation receipts    | `note-entities.test.ts`, entity/mention regression tests; live search/read/create results and chips in regular chat and `/chats`. Removing note extraction caused the regression cases to fail before restoration.                                                                                                          |
| 4–5: identity, duplicates, rename/move                | Canonical-reference parser tests; duplicate QA note moved to root and renamed while its archived chip retained the original wording and opened its current document.                                                                                                                                                        |
| 6: formatting and links                               | Live title autosave and assistant append retained two headings, lists, hard breaks, and the `Riset pengguna` noteLink. Reopened content was checked through the owner-scoped API and editor.                                                                                                                                |
| 7–9: responsive editor, save guards, recovery         | `note-drawer.spec.ts` exercises desktop/mobile editing, close/send guards, failure/discard/retry, resize, and edits arriving during an in-flight save. Offline browser check retained a draft in the visible editor.                                                                                                        |
| 10: competing changes                                 | Browser cases compare saved/draft versions, require a fresh comparison for a third edit, and assert the version actually written. Live external update produced paused autosave and retained the local draft.                                                                                                               |
| 11–12: current-message target and explicit precedence | Live “Ringkas catatan ini” and append requests used the selected QA reference. The append completed `read_custom_note` then `update_custom_note`. A named different destination was read while the submitted active reference remained stable. Context-builder tests cover message-local identity and historical isolation. |
| 13–14: prevented dispatch, persistence and access     | Browser tests assert no dispatch before save recovery and retain composer text; unavailable selection blocks sends until closed. ActiveNoteService tests check invalid/inaccessible references. Repository tests cover persisted identity, and orchestrator tests reject a replay with a changed target.                    |
| 15–16: empty/unavailable and keyboard recovery        | Cleared daily fixtures create no stored row on open. An unavailable dirty note retains a read-only, copyable draft until explicit discard. Browser tests cover responsive presentation, focus and comparison actions. Workspace regression suite covers the reused editor and links.                                        |
| 17: channel isolation                                 | Live `/chats` created a sandbox custom and daily note in all three channels. Web rendered snapshot popovers; Telegram/WhatsApp raw responses contained readable text without `#note/` links. Existing preview/renderer tests and backend preview isolation tests cover normal-account boundaries.                           |

## Visual inspection

Inspected the Penpot page through MCP, including desktop custom/daily, save failure, paused autosave, comparison, mobile editor/comparison/unavailable, and supporting states. The desktop panel measures 720 px at a 1440 px viewport, with an 80 px header. Compact layouts use a 64 px header and 24 px content inset. Comparison stays inside the panel and stacks its independently scrollable documents on mobile.

Screenshots are in `.impeccable/review/chat-notes-implementation/`: `desktop-current.png`, `mobile-current.png`, `desktop-save-failure-current.png`, comparison captures, empty/long-note captures, `mobile-unavailable.png`, and `channel-previews.png`. Older captures in this folder record intermediate layouts; use files containing `current` when present.

The seeded QA data includes a duplicate “Keputusan desain”, an empty custom note, a 12-section long note, and a daily backlink on 17 October. Original seeded notes were preserved. The empty QA note was temporarily trashed to inspect unavailable behavior and restored. No Telegram or WhatsApp messages were delivered externally.

## Reproduction commands

Run from `apps/frontend`, with Bun on PATH:

```sh
bun test src/components/chat/note-entities.test.ts src/components/chat/chat-entities.test.ts src/components/chat/entity-mentions.test.ts
bunx playwright test --config playwright.entities.config.ts note-drawer.spec.ts entity-renderer.spec.ts chat-previews.spec.ts --workers 1
PLAYWRIGHT_BASE_URL=http://localhost:3000 PLAYWRIGHT_BACKEND_URL=http://localhost:5000 bunx playwright test --config playwright.config.ts notes-workspace.spec.ts notes-navigation.spec.ts --workers 1
bun run check-types
bun run build
```

Run from `apps/backend`:

```sh
bun run test --runInBand active-note.service.spec prisma-conversation-active-note.repository.spec context-builder.service.spec assistant-orchestrator.service.spec prisma-chat-preview.repository.spec terminal-tool-response.spec telegram.adapter.spec
```

Use separate Playwright output directories for simultaneous runs. Avoid changing frontend source during fixture tests: Vite hot replacement can detach the provider while a test is exercising it. Cold development compilation also requires waiting for the actual note request before asserting editor readiness.

The final drawer run passed all 20 desktop/mobile cases. The separate final channel/entity-renderer run passed all 74 cases. The seven-suite backend run passed 189 tests, the daily-tool suite passed six, and the parser run passed 40. The workspace/navigation run passed 43 of 44; the remaining case timed out awaiting its initial note request and passed on an isolated rerun. Type checks, targeted ESLint checks with zero warnings, production build, and `git diff --check` passed.

Run fixture suites sequentially when they use Playwright-managed servers: a run that reuses another run's server loses it when the owning run finishes. An affected renderer run was stopped after confirming `ERR_CONNECTION_REFUSED`, then rerun separately.

The Penpot watchdog confirmed a healthy plugin round trip during inspection. It was stopped after the design reads; its last probes had encountered connection failures. It is not required by the application.

The local model occasionally returned its existing visible failed-run response during verification. Explicit retries subsequently completed, and the successful append was checked in stored content. These transient model failures did not report successful note writes.
