# Chat previews — built surface

## Overview

`/chats` is an **Operate** utility for comparing Web chat, Telegram, and WhatsApp outputs. It is development-only and requires login. Previews remain local, send no external deliveries, and reuse the existing message endpoint. Product authority remains [Sydia PRD](../../docs/Sydia_PRD.md); implementation details live in [Chat previews](../../docs/CHAT_PREVIEWS.md).

**THESIS:** Compare channel outputs from one input. **OWN-WORLD:** Existing Sydia styling for Web chat and shared controls, with scoped native channel styling for Telegram and WhatsApp. **STORY:** Three isolated outputs, one input. **FIRST VIEWPORT:** Channel logos, named headers, histories, and a standalone composer with Send above New session; no page heading. **FORM:** Detached equal panels and a separate composer panel, with horizontal comparison scrolling on mobile.

## Colors

Web chat and shared controls inherit [Aurora Haze](../../DESIGN.md), its existing tokens, and Sydia's logo, button, and entity treatments. Telegram uses its official blue plane logo, pale-blue history, pale-green outgoing bubbles, and white incoming bubbles. WhatsApp uses its logo, warm-neutral history, green outgoing bubbles, and white incoming bubbles. These user-requested native treatments are scoped to the previews; they introduce no global tokens. HTTP and download links retain accessible dark ink and an underline.

## Typography

Inter carries the compact hierarchy: semibold channel names (16px), response text (16px with 24px leading), user messages and supporting text (14px), and status/disclosure labels (12px). Code retains the existing monospace treatment. The main landmark and textarea retain accessible names without a visible page heading or composer label.

## Layout

**The Equal Comparison Rule.** Three equal, individually bordered desktop panels show Web chat, Telegram, and WhatsApp in that order, separated by gaps (16px). Each inbox scrolls only its own history as responses arrive, preserving the horizontal comparison position. The comparison grid has a minimum width (900px).

Mobile preserves the user-approved side-by-side composition through horizontal scrolling. A separate composer panel sits beneath the comparison region with the same gap (16px) and fits the viewport. Its right-hand action group places **New session** directly below **Send**.

## Components

**The One Input Rule.** One composer, named through its textarea's accessible label, sends the same message to all three isolated histories. Enter submits; Shift+Enter adds a line. Send and New session are disabled while a channel is responding. New session clears all three histories together.

Each pane exposes its own responding status, error, and **Retry this channel** action. Successful responses remain visible when another channel fails. **Raw response** is an optional, collapsed disclosure beneath each completed response.

Web chat uses existing Markdown rendering and entity pills. Entity popovers inspect confirmed response snapshots and direct changes back through the composer. Telegram preserves plain text, line breaks, and HTTP links; its Markdown markers remain literal. WhatsApp renders supported bold, italic, strikethrough, code/monospace, bullets, numbered lists, quotes, and links; unsupported syntax remains visible.

## Do's and Don'ts

- **Do** preserve equal channel weighting, the shared composer, and visible per-channel recovery.
- **Do** keep raw text and snapshot details available through disclosure.
- **Do** preserve the approved native channel cues as approximate previews of channel presentation.
- **Don't** promote these scoped brand colors or this surface's composition into the global design system.

Built evidence: [desktop](../review/chat-previews-desktop.png), [mobile](../review/chat-previews-mobile.png), and the chat preview, native text, and entity snapshot components in `apps/frontend/src/components/chat`.

Reviewer disposition: **ship** after the full scoped review; **no material findings**. This surface brief records the built utility without changing the global design system or canonizing new tokens.
