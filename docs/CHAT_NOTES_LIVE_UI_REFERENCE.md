# Chat Notes: live conversation reference

Inspected on 18 October 2026 using agent-browser, signed in normally to the local development app as the seeded Demo User. Existing note and task conversations supplied the data; no additional chat messages or notes were created. Temporary composer text was cleared after inspection.

## Observed UI

| Element              | Measured behavior                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Desktop viewport     | 1440 × 960; expanded sidebar is 272 px wide; collapsed sidebar is 72 px wide.                                                                          |
| Conversation heading | Screen-reader-only; no visible conversation title bar.                                                                                                 |
| Message list         | Centered, maximum width 768 px, with 24 px desktop horizontal padding and 40 px top padding.                                                           |
| Message spacing      | 48 px between message groups.                                                                                                                          |
| Date separator       | Centered “Hari ini,” 12 px Inter, 16 px line height, muted ink.                                                                                        |
| User message         | Right aligned; 16 px Inter with 24 px line height; 12 × 16 px padding; 16 px corner radius; ink at 6% opacity background.                              |
| Assistant message    | Plain muted 16 px Inter with 24 px line height, maximum width 576 px; no assistant avatar or name label.                                               |
| Existing task chip   | 28 px high; 14 px Inter at weight 500; 24 px line height; 2 × 10 px padding; metadata continues inline.                                                |
| Docked composer      | Maximum width 768 px; 52 px high when empty; gray ink-at-6% surface, subtle border, 26 px radius; 12 px from viewport bottom.                          |
| Composer controls    | Paperclip and horizontal-send icons, 34 px button footprints; send uses the existing Aurora treatment. The composer grows with wrapped/multiline text. |
| Sidebar              | Actual logo and navigation icons; 42 px navigation cadence; dense 40 px conversation cadence; count and truncated conversation labels.                 |
| Mobile viewport      | 390 × 844 browser viewport, 64 px Sydia header with menu and account avatar; no mock device status bar or home indicator.                              |
| Mobile messages      | 16 px horizontal insets; user bubble at most 85% of content width; same message typography and spacing.                                                |
| Mobile composer      | 358 × 52 px at x=16, y=780 when empty.                                                                                                                 |

At the observed desktop width, the existing custom-note conversation has its user bubble at y=80 and assistant reply at y=176. At the observed mobile width these become y=136 and y=256 because of the app header and the wrapped user question. The note's title, type, path and update timestamp currently form one list item; the proposed chip must preserve that inline flow.

## Reference captures

- [Real custom-note conversation, expanded desktop sidebar](../.impeccable/review/chat-notes-correction/sydia-real-note-chat-desktop.png)
- [Real task conversation, collapsed desktop sidebar](../.impeccable/review/chat-notes-correction/sydia-real-task-chat-collapsed.png)
- [Real custom-note conversation, mobile](../.impeccable/review/chat-notes-correction/sydia-real-note-chat-mobile.png)

The floating development-tools control in these captures is development-only. It is not part of the proposed note feature. Existing conversation chrome is the fidelity reference; the note chip, active-note context and drawer are proposed additions governed by [CHAT_NOTES_SPEC.md](./CHAT_NOTES_SPEC.md).
