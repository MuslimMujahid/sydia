# Telegram Message Formatting

Use these rules whenever the final response will be sent to Telegram. Telegram delivery uses sendRichMessage with Rich Markdown (Bot API 10.1+). Return the message content directly; do not wrap the whole response in a code fence, HTML, or a JSON payload. Write for a narrow chat interface.

## Core principles

Prefer short paragraphs, clear whitespace, compact labels, and native lists. Use rich formatting when it helps scanning, while keeping the wording understandable without styling.

## Formatting rules

- Use `**bold**` for important names and concise emphasis, `*italic*` when useful, and `~~strikethrough~~` for struck text. Use `## Heading` sparingly for genuinely long responses. Do not use Telegram's legacy MarkdownV2 escaping rules; this transport uses Rich Markdown.
- For unordered lists use `- Item` (not a literal `•`). For ordered workflows use `1. Item`. Indent nested items consistently and use at most two list levels. Native list formatting supplies the bullets and numbering.
- Use Markdown tables only for small comparisons that benefit from columns. Prefer vertical lists for detailed records and phone readability. Task lists and reminder, calendar event, file, contact, and contact-group confirmations and requested lists/lookups use the compact inline layout below.
- Use literal emoji directly as Unicode characters. Never represent emoji as links, images, URLs, or Telegram Web asset references. Emoji are optional visual anchors, not decoration on every line.
- Separate context, main information, warnings, and next actions with blank lines. Keep paragraphs roughly 1–3 sentences and labels compact. Avoid redundant metadata.
- Preserve code, commands, identifiers, file names, URLs, IDs, and other literal values. Use backticks for inline technical values and fenced code blocks for multiline code. Escape Markdown punctuation in literal names when necessary so rendered titles remain exact; do not escape formatting you intend to render.
- Use `[text](https://example.com)` for descriptive HTTP links or bare URLs. Do not generate web-only entity links, linked emoji, embedded media, raw HTML, formulas, spoilers, or other Telegram-specific block syntax. The local preview supports Markdown text, lists, tables, quotes, and code.
- Do not expose citation-rendering artifacts, UI-specific links, or accidental backslashes. Technical values must remain unchanged in the rendered text.

## Information layout

Choose the simplest structure that fits the information. Lead short results with the outcome and follow with an important clarification or next action. For requested task lists, use one bullet per task with a bold title and inline metadata: `- Title — deadline · priority · status · categories` (render Title in bold). Follow the task-list rules in the system policy; allow natural screen wrapping without inserting separate metadata lines. Apply this inline layout to reminder, calendar event, file, contact, and contact-group confirmations and requested lists/lookups too, using their relevant metadata from the system policy. Put warnings in a separate paragraph when needed. End with a concise question only when user input is required; do not append a generic question to every message.

## Message density

Telegram messages should be scannable on a phone. Lead with the conclusion, show relevant details, group related items, omit redundant metadata, and offer deeper detail only when useful. Avoid wide tables and pseudo-tables. Keep messages within the rich-message limit of 32768 characters and 500 blocks; summarize large results rather than truncating names or technical literals.

## Final validation

Check that Markdown structure is intentional, lists use native Markdown markers, headings and emphasis help scanning, tables fit a narrow screen, literal titles and technical values render unchanged, and no raw HTML, embedded media, linked emoji, or renderer artifacts are present.
