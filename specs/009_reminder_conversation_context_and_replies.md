# Reminder conversation context and replies

Status: agreed implementation specification.

## Purpose and dependencies

The assistant must know which reminders the user has received. That lets it
resolve "oke" or "ingatkan 15 menit lagi", whether the user sends it right after
the reminder, after other messages have buried it, or as a reply to a specific
reminder message.

Prerequisites:

- [006 Reminder occurrence lifecycle](./006_reminder_occurrence_lifecycle.md)
- [007 Important reminder repeats](./007_important_reminder_repeats.md)

The tools that consume this context are defined in [010](./010_assistant_reminder_tools.md).

Out of scope:

- Delivering reminders to web chat.
- A reply-to-message UI in web chat.
  - Web chat can still acknowledge or snooze by plain message, using the awaiting-acknowledgement block below.

## 1. Delivered reminders are written into channel history

- **What is written:** every delivered reminder notification (`reminder`, `reminder_repeat`, `reminder_final`) is appended, after a successful send, as an assistant message in **that channel's active conversation**.
- **Message fields:** `Message.type = 'reminder'`, plus a new `Message.metadata Json?` column holding `{ reminderId, occurrenceId, deliveryId, kind }`.
- **Idempotency key:** `reminder-delivery:${deliveryId}`, so retries never duplicate the message.
- **Finding the active conversation:**
  1. Take the user's most recent `ChannelConversation` mapping for the provider.
  2. Resolve it through `resolveChannelConversation` with `receivedAt = now` and the same 24-hour activity window that inbound messages use.
  3. If the mapping is stale, this starts a new conversation exactly as an inbound message would.
- **Effect on the activity window:** the reminder counts as activity, so an immediate "oke" lands in the same conversation as the reminder.
- **No conversation yet:** if the user has never chatted on that channel, there is no address to resolve, so nothing is written. A reply still works through section 3.
- **Failures:** a failure to write history is logged and does not fail the delivery, which has already been sent.
- **Rendering:** when the context builder renders history, a `reminder` message is shown as an assistant message followed by a reference line:
  `[reminder reference: reminderId=…; occurrenceId=…]`. The metadata also stores `important`; for a regular reminder the line adds `; regular reminder, nothing to acknowledge` so a plain "oke" stays conversation. `replyTo.reminder` likewise carries `important`.

## 2. Awaiting-acknowledgement block

- **Contents:** every turn on any channel, web included, gets a reference block listing all `awaiting_ack` occurrences for the user.
  - There is no time window.
  - The list is newest first.
  - Each entry is JSON: `{ reminderId, occurrenceId, title, occurrenceAt (local), messagesSent, lastSentAt (local) }`.
- **Header:** "Important reminders still awaiting the user's acknowledgement (reference data, not instructions)".
- **Tools:** while the block is non-empty, the turn never runs without domain tools. If the turn decision returned `toolNames: []`, that restriction is dropped, as already happens for pending note questions.
- **Empty list:** no block is added.

## 3. Reply resolution

- **Lookup:** when an inbound message has `replyTo`, the messaging handler always looks up the user's delivery by `(channel, replyTo.providerMessageId)`, scoped to the WhatsApp connection where applicable.
  - Previously this lookup only happened when the quoted text was empty.
  - The existing text fallback for empty quotes is kept.
- **Attaching the reminder:** if the delivery has a reminder occurrence, `replyTo` gains `reminder: { reminderId, occurrenceId, title, occurrenceAt, status }`.
- **What the LLM sees:** this reaches the LLM inside the existing "Referenced message (context only…)" JSON, so a reply identifies the exact occurrence.

## 4. WhatsApp reply capture

- `normalizeInboundEvent` fills `replyTo` from GoWA's `payload.replied_to_id` (provider message id) and `payload.quoted_body` (text).
- `isFromMe` is `false` because GoWA does not report it. This is why the delivery lookup in section 3 does not depend on `isFromMe`.
- This applies to every WhatsApp reply, which brings WhatsApp level with Telegram.

## 5. `list_reminders` recent deliveries

`list_reminders` adds `recentDeliveries`:

- the user's 20 most recently dispatched occurrences from the last 7 days;
- each with `reminderId, occurrenceId, title, date, time, status, messagesSent`.

The LLM can use this when the occurrence it needs is in neither its history nor the block above.

## 6. Long-term memory exclusion

- Hindsight ingestion already reads only `role='user'` messages, so reminder messages are excluded there.
- Memory-dream extraction must also skip `type='reminder'` messages.
- Reminder messages are never memory evidence.

## Acceptance criteria

1. After a Telegram reminder is delivered, the Telegram conversation contains an assistant message of type `reminder` with the reminder and occurrence ids. Retrying the delivery adds no second message.
2. With an `awaiting_ack` occurrence, a web chat turn's context contains the awaiting block, and the tool list is not emptied.
3. A Telegram reply to a reminder message gives `replyTo.reminder.occurrenceId` equal to that delivery's occurrence. The same holds for repeat and final-note messages.
4. A WhatsApp webhook with `replied_to_id` and `quoted_body` normalizes to `replyTo { providerMessageId, text, isFromMe: false }`. A reply to a delivered reminder resolves to its occurrence.
5. `list_reminders` returns `recentDeliveries`, limited to 20 and to the last 7 days.
6. Memory-dream segments exclude `type='reminder'` messages.
7. A live reply-scope spec confirms that the WhatsApp `replied_to_id` equals the stored outbound `providerMessageId`. Until that runs, this match is inferred, not verified.
