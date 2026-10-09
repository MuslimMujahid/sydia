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

## Rendering behavior

- Web chat uses the existing Markdown and entity renderer. Entity popovers show
  snapshots from tool results; they do not fetch or mutate normal user entities.
- Telegram previews plain text, line breaks, emoji, and HTTP links. The current
  outbound adapter supplies neither `parse_mode` nor explicit formatting entities,
  so Markdown markers remain literal. Telegram supports rich formatting when
  explicitly requested: [Telegram Bot API formatting options](https://core.telegram.org/bots/api#formatting-options).
- WhatsApp renders bold, italic, strikethrough, monospace, inline code, bullets,
  numbered lists, and quotes using its text markers. Unsupported syntax stays
  visible. See [WhatsApp text formatting](https://faq.whatsapp.com/539178204879377/).

These are local text previews of the existing channel pipeline, not external
deliveries or replicas of every native client's typography and link cards.

## Targeted verification

From `apps/backend`:

```sh
bun run test --runInBand prisma-chat-preview.repository.spec assistant-orchestrator.service.spec
bun run check-types
```

From `apps/frontend`:

```sh
bun test src/components/chat/whatsapp-format.test.ts src/lib/services/api/conversations/conversations.api.test.ts
bunx playwright test --config playwright.entities.config.ts chat-previews.spec.ts --workers 2
bun run check-types
bun run build
```

Browser tests use synthetic responses at the HTTP boundary while exercising the
real composer, stream client, session controls, and renderers on desktop and mobile.
