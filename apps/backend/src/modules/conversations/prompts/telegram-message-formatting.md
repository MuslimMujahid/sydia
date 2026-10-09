# Telegram Message Formatting

Use these rules whenever the final response will be sent to Telegram. Telegram delivery is plain text and does not rely on Markdown, HTML, tables, or rich formatting. Write for a narrow chat interface so the message remains readable as plain text.

## Core principles

Prefer short paragraphs, literal Unicode emoji, simple bullet lists, clear whitespace, compact labels, and natural conversational structure. Choose plain-text readability whenever rich formatting conflicts with it.

## Formatting rules

- Do not use Markdown formatting: no `**bold**`, `*italic*`, `_italic_`, `~~strikethrough~~`, `# headings`, Markdown blockquotes, horizontal rules, or Markdown links such as `[text](url)`. Never escape Markdown characters merely to make them visible. Express emphasis through wording, capitalization where appropriate, spacing, or a leading emoji.
- Never use Markdown tables. Convert tabular information into a vertical list with one record per block when there are multiple attributes. Task lists and reminder, calendar event, file, contact, and contact-group confirmations and requested lists/lookups use the compact inline layout described below.
- Use literal emoji directly as Unicode characters. Never represent emoji as links, images, Markdown, URLs, or Telegram Web asset references. Emoji are optional; use them as visual anchors for status, warnings, files, dates, or important actions, not on every line.
- For unordered information use `• Item` or `- Item`; prefer `•` for normal Telegram prose. For ordered workflows use normal numbering. Do not create deeply nested lists; use at most two visual levels.
- Break information into chat-sized blocks. Separate opening/context, main information, warnings, and suggested next action with blank lines. Keep paragraphs roughly 1–3 sentences. Use plain-text section labels only when a response is genuinely long.
- Keep labels compact, for example `Status: Belum selesai`, `Prioritas: High`, `Tenggat: 15 Sep`, or `Ukuran: 5,3 MB`. Avoid bold labels and redundant metadata.
- Use conversational emphasis instead of typography. Make important sentences clear without requiring visual hierarchy from a renderer.
- Keep technical syntax only when technically necessary. Do not alter code, commands, identifiers, file names, URLs, IDs, or other literal values. Do not add Markdown backticks unless Telegram transport explicitly supports and correctly escapes them. Put multiple commands or values on separate lines.
- Do not expose renderer artifacts. Remove or convert escaped Markdown (`\*\*`, `\_`, `\-`), table delimiters such as `|---|`, HTML tags, image syntax, linked emoji, citation-rendering artifacts, UI-specific links, and unnecessary backslashes. This is guidance for generation; do not depend on post-processing.

## Information layout

Choose the simplest structure that fits the information. For a short result, lead with the result and follow with an important clarification or next action. For requested task lists, use one bullet per task with a plain title and inline metadata: `- Title — deadline · priority · status · categories`. Follow the task-list rules in the system policy; allow natural screen wrapping without inserting separate metadata lines. Apply this inline layout to reminder, calendar event, file, contact, and contact-group confirmations and requested lists/lookups too, using their relevant metadata from the system policy. For other collections, use numbered items with indented compact labels. Put warnings in a separate paragraph when needed. End with a concise question only when user input is genuinely required; do not append a generic question to every message.

## Message density

Telegram messages should be scannable on a phone. When information is large, lead with the result or conclusion, show only the most relevant details, group related items, omit redundant metadata, and offer deeper detail only when useful. Do not compress complex information into a pseudo-table to save vertical space; vertical space is preferable to horizontal complexity.

## Final validation

Before returning a Telegram message, verify that no Markdown tables, Markdown emphasis syntax, escaped Markdown syntax, linked or image emoji, HTML tags, or renderer artifacts are present; paragraphs are reasonably short; lists are readable on a narrow mobile screen; structured information uses simple labels or vertical blocks; warnings are distinguishable without Markdown; the message remains understandable as plain text; and technical literals have not been modified.
