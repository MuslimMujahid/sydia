# Development chat previews

Run the normal frontend and backend development commands, sign in, and open
`/chats`. The development navigation also includes **Chat previews**. The backend
development scripts set `NODE_ENV=development`; production rejects preview
options, and the frontend production route returns not found.

One composer sends three concurrent requests to the existing
`POST /conversations/messages/stream` endpoint. Each request adds a UUID
`previewSessionId` and a `previewChannel` (`web`, `telegram`, or `whatsapp`).
The existing conversation detail and retry endpoints accept the same scope as
query parameters. Normal chat requests omit these fields and behave as before.

The shared preview client has web, Telegram, and WhatsApp wrappers. The backend
derives a separate sandbox user from the authenticated owner, session, and
channel. Existing tools, conversation repositories, and ownership checks then
operate on that sandbox: tasks, reminders, categories, memories, and message
idempotency cannot collide across channels or affect the owner's normal data.
Sandbox users copy the owner's locale, timezone, and persona, have no credentials
or linked messaging identities, cannot sign in, and have notifications, briefings,
and automatic memory disabled. No schema migration is needed.

**New session** resets all three histories and creates a fresh scope. Previous
sandbox records remain in the development database. A failed channel shows its
own error and retry action while successful responses stay visible. Transport
retries preserve message idempotency; failed assistant runs use the existing
retry endpoint. Interrupted streams use the existing bounded reconciliation
against persisted conversation state and log any degraded recovery.

## Development toolbar

In Vite development mode, signed-in pages with completed onboarding show a
floating **Development tools** toggle at the bottom right. Open it to send a
daily brief, weekly brief only, weekly + daily brief, or follow-up, or follow
**Chat previews** to `/chats`.

Manual sends use `POST /dev/notifications/daily-brief`,
`POST /dev/notifications/weekly-brief`,
`POST /dev/notifications/daily-weekly-brief`, and
`POST /dev/notifications/follow-up`. All require backend
`NODE_ENV=development` and use the current session's account. They send through
the existing notification pipeline to enabled Telegram and WhatsApp channels,
respect notification preferences, and only include due tasks in follow-ups.
These actions send real notifications for that account.

Manual brief actions choose their exact format on any weekday, using today in
the account's timezone as the start date. **Weekly brief only** groups all seven
days by date, without a separate daily section; **Weekly + daily brief** sends
one combined **Today** and **Coming six days** message. **Daily brief** always
sends just today's brief. Weekly-only sends require the weekly switch; combined
sends require both daily and weekly switches. Each variant has its own manual
delivery key, and retries of that variant reuse the original key and saved text.

Daily briefs and follow-ups use compact bullet rows with a title followed by
inline metadata (`—` and `·` separators). Telegram adds bold titles; WhatsApp
keeps plain titles. Follow-ups use a fixed introduction in the account's locale
with the task count; they do not use persona variants or a closing question.
Daily briefs group overdue tasks first, followed by tasks due
today, agenda, and reminders, omitting empty sections. Dates use the account's
locale and timezone, and default task priority is omitted. A brief's persona
introduction is generated once; if the model is unavailable or returns empty
text, a warning records the use of a localized deterministic introduction.
Record lists use the same formatter in either case. Each channel's final text is
persisted before enqueue, and retries reuse that saved text.

Weekly briefs share the daily send time and have their own switch and ISO weekday
(Monday = 1 through Sunday = 7) in notification settings. They default to Monday,
enabled; the migration preserves opt-outs for accounts that had daily briefs off.
The selected day covers that local date and the following six dates, ending at
the next local midnight after day seven (including across DST). Daily and weekly
briefs use one job and delivery key for the date. On the weekly day, **Today** is
followed by **Coming six days**, grouped by date, with no repeated items; a
Telegram divider (`---`) separates those sections and counts toward the message
budget. A multi-day event is listed once with its complete range. Weekly-only
accounts receive this complete seven-day brief on their selected day.
Recurring events and reminders include their occurrences within that window;
reminder recurrence uses the reminder's timezone and respects its end date.

Briefings stay within a conservative 4,096-character text budget per channel.
Included rows retain their full existing title, date/time, and priority details.
When space runs out, whole items are omitted: overdue first, then earliest due or
start time, with task priority breaking ties. The message shows the omitted count,
and the worker logs `briefing_items_omitted` with per-channel counts. An individual
row larger than the whole budget is omitted intact, never shortened. An oversized
introduction/heading set fails visibly rather than producing an undeliverable
message. Empty future periods are stated explicitly. Quiet hours apply to both
briefing schedules. Manual actions select their requested format independently
of the scheduled weekly day.

Run the delivery worker from `apps/backend`:

```sh
NODE_ENV=development bun run dev:worker
```

## Replies to Telegram task lists

Telegram replies preserve visible text from rich message blocks, including list
items and nested formatting. If Telegram supplies an empty reference to a bot
notification, the handler looks up its saved delivery by owner, channel, and
provider message ID and logs the recovery. If neither that content nor a selected
quote is available, it logs a warning and asks the user to resend the content or
name the items. The entire coalesced batch stops before invoking the assistant;
no task mutations run with an unresolved reference. Notification lookup failures
use the normal logged processing error path.

The `/chats` composer does not simulate native reply metadata. Verify this path
with the adapter and messaging tests, plus the opt-in synthetic model test from
`apps/backend` (all tasks stay in memory; no Telegram messages are sent):

```sh
node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./jest.config.mjs --runInBand src/infra/telegram src/modules/messaging src/modules/conversations/services/context-builder.service.spec.ts src/database/repositories/prisma-notification.repository.spec.ts
REPLY_SCOPE_LIVE_ENABLED=true node --env-file=../../.env --experimental-vm-modules node_modules/jest/bin/jest.js --config ./jest.config.mjs --runInBand test/messaging/reply-scope.live.spec.ts
```

This checks the three referenced tasks against a fourth unrelated open task,
selected quote scope, and an explicit request to complete every open task.

A queued result confirms queue acceptance, not actual delivery. Each deliberate
send receives a distinct request key; retrying a failed send of the same kind
reuses its key to avoid duplicate delivery.

Verify the toolbar from `apps/backend` and `apps/frontend`, respectively:

```sh
bun run test --runInBand src/modules/notifications
```

```sh
bunx playwright test --config playwright.entities.config.ts dev-toolbar.spec.ts --workers 2
```

## Rendering behavior

- Confirmed note results use canonical `custom:ID` or `daily:YYYY-MM-DD`
  identities. Web replies may use `[title](#note/ENCODED_REFERENCE)`; the renderer
  accepts only identities confirmed by that reply's successful note tools.
  Folder-only, missing, failed, and ambiguous results stay plain text. Successful
  note mutations append a chip when the response omits its title.
  In `/chats`, note chips show sandbox snapshots only: they never fetch normal
  account notes, open the editable drawer, or send active-note context. Use
  regular authenticated Web chat for editing, autosave, and conflict checks.
  Telegram and WhatsApp replies retain channel-native note text without `#note/`
  links. Inspect **Raw response / Respons mentah** to check the original syntax.
  Note search/read results are persisted for new replies; historical replies
  without confirmed tool metadata remain plain text.
- Web chat uses the existing Markdown and entity renderer. Entity popovers show
  snapshots from tool results; they do not fetch or mutate normal user entities.
  Task lists use `[title](#task/ID)` references with URL-encoded IDs confirmed by
  the current turn's tool results. These render as pills even when titles repeat.
  An unconfirmed reference keeps its label as plain text; completed replies log
  a warning. It never links to a guessed task. Older replies retain unique-title matching.
  Current task questions require a fresh lookup even when recent chat context
  contains an answer. `list_tasks` defaults to unfinished (`inbox`) tasks; `all`
  explicitly includes every status. `due=tomorrow` covers only the next calendar
  day in the account timezone, including daylight-saving transitions.
- Telegram delivers replies through `sendRichMessage` with the `markdown` field
  (Bot API 10.1+). The local preview renders the supported Markdown text subset:
  emphasis, headings, nested bullet and numbered lists, task lists, tables,
  quotes, code, and links. It does not add web entity pills. Raw HTML, media,
  formulas, spoilers, and Telegram-specific blocks are not simulated. The
  assistant's Telegram prompt requests this text subset and literal emoji.
  See [Telegram rich-message formatting](https://core.telegram.org/bots/api#rich-message-formatting-options).
  API failures propagate to the existing delivery failure handling; the adapter
  does not silently retry as plain text or risk a duplicate delivery.
- WhatsApp renders bold, italic, strikethrough, monospace, inline code, bullets,
  numbered lists, and quotes using its text markers. Unsupported syntax stays
  visible. See [WhatsApp text formatting](https://faq.whatsapp.com/539178204879377/).

These are local text previews of the existing channel pipeline, not external
deliveries or replicas of every native client's typography and link cards.

## Targeted verification

From `apps/backend`:

```sh
bun run test --runInBand prisma-chat-preview.repository.spec assistant-orchestrator.service.spec
bun run test --runInBand telegram.adapter.spec terminal-tool-response.spec context-builder.service.spec
bun run test --runInBand domain-tools.spec
bun run test --runInBand src/modules/notifications src/modules/users/dto/update-user-preferences.dto.spec.ts src/modules/users/services/user-preferences.service.spec.ts
bun run check-types
```

From `apps/frontend`:

```sh
bun test src/components/chat/telegram-rich-text.test.tsx src/components/chat/whatsapp-format.test.ts src/lib/services/api/conversations/conversations.api.test.ts
bun test src/components/chat/entity-mentions.test.ts src/components/chat/chat-entities.test.ts
bun test src/components/chat/note-entities.test.ts
bunx playwright test --config playwright.entities.config.ts note-drawer.spec.ts --workers 1
bunx playwright test --config playwright.entities.config.ts entity-renderer.spec.ts --workers 2
bunx playwright test --config playwright.entities.config.ts chat-previews.spec.ts --workers 2
bunx playwright test --config playwright.entities.config.ts notification-settings.spec.ts --workers 2
bun run check-types
bun run build
```

The opt-in model regression replays an identical question from another chat on
all three channels. It uses synthetic tasks without database or channel writes:

```sh
cd apps/backend
TASK_LISTS_LIVE_ENABLED=true node --env-file=../../.env --experimental-vm-modules node_modules/jest/bin/jest.js --config ./jest.config.mjs --runInBand test/messaging/task-lists.live.spec.ts
```

Browser tests use synthetic responses at the HTTP boundary while exercising the
real composer, stream client, session controls, and renderers on desktop and mobile.
