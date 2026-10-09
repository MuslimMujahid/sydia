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
daily brief or follow-up, or follow **Chat previews** to `/chats`.

Manual sends use `POST /dev/notifications/daily-brief` and
`POST /dev/notifications/follow-up`. Both require backend
`NODE_ENV=development` and use the current session's account. They send through
the existing notification pipeline to enabled Telegram and WhatsApp channels,
respect notification preferences, and only include due tasks in follow-ups.
These actions send real notifications for that account.

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

Run the delivery worker from `apps/backend`:

```sh
NODE_ENV=development bun run dev:worker
```

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

- Web chat uses the existing Markdown and entity renderer. Entity popovers show
  snapshots from tool results; they do not fetch or mutate normal user entities.
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
bun run check-types
```

From `apps/frontend`:

```sh
bun test src/components/chat/telegram-rich-text.test.tsx src/components/chat/whatsapp-format.test.ts src/lib/services/api/conversations/conversations.api.test.ts
bunx playwright test --config playwright.entities.config.ts chat-previews.spec.ts --workers 2
bun run check-types
bun run build
```

Browser tests use synthetic responses at the HTTP boundary while exercising the
real composer, stream client, session controls, and renderers on desktop and mobile.
