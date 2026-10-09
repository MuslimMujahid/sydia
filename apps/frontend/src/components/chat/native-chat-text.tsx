import { Fragment, type ReactNode } from "react";
import { parseWhatsAppText, type WhatsAppInline } from "./whatsapp-format";
import { TelegramRichText } from "./telegram-rich-text";

function linkedText(text: string): ReactNode {
  return text.split(/(https?:\/\/[^\s<>]+)/g).map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noreferrer noopener"
        className="text-ink underline underline-offset-2"
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

function inline(parts: WhatsAppInline[]): ReactNode {
  return parts.map((part, index) => {
    if (part.kind === "text")
      return <Fragment key={index}>{linkedText(part.text)}</Fragment>;
    if (part.kind === "code")
      return (
        <code
          key={index}
          className="rounded-sm bg-ink/5 px-1 font-mono text-[0.9em]"
        >
          {part.text}
        </code>
      );
    const children = inline(part.children);
    if (part.kind === "bold") return <strong key={index}>{children}</strong>;
    if (part.kind === "italic") return <em key={index}>{children}</em>;

    return <s key={index}>{children}</s>;
  });
}

export function NativeChatText({
  content,
  channel,
}: {
  content: string;
  channel: "telegram" | "whatsapp";
}) {
  if (channel === "telegram") return <TelegramRichText content={content} />;
  const blocks = parseWhatsAppText(content);
  const nodes: ReactNode[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    if (block.kind === "bullet" || block.kind === "number") {
      const items: ReactNode[] = [];
      const start = block.number;
      const first = index;

      while (index < blocks.length && blocks[index]?.kind === block.kind) {
        items.push(<li key={index}>{inline(blocks[index]!.content)}</li>);
        index += 1;
      }

      index -= 1;
      nodes.push(
        block.kind === "bullet" ? (
          <ul key={first} className="list-disc pl-5">
            {items}
          </ul>
        ) : (
          <ol key={first} start={start} className="list-decimal pl-5">
            {items}
          </ol>
        )
      );
    } else if (block.kind === "quote")
      nodes.push(
        <blockquote
          key={index}
          className="border-l border-ink/30 pl-3 text-ink-muted"
        >
          {inline(block.content)}
        </blockquote>
      );
    else
      nodes.push(
        <div key={index} className="min-h-6">
          {inline(block.content)}
        </div>
      );
  }

  return (
    <div className="break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
      {nodes}
    </div>
  );
}
