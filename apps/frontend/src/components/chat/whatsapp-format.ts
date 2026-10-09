export type WhatsAppInline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "bold" | "italic" | "strike"; children: WhatsAppInline[] };
export type WhatsAppBlock = {
  kind: "paragraph" | "bullet" | "number" | "quote";
  number?: number;
  content: WhatsAppInline[];
};

const MARKERS = [
  ["```", "code"],
  ["`", "code"],
  ["*", "bold"],
  ["_", "italic"],
  ["~", "strike"],
] as const;

const WORD = /[\p{L}\p{N}]/u;

/** WhatsApp syntax, not CommonMark. Code is opaque; technical literals stay literal. */
export function parseWhatsAppInline(text: string, depth = 0): WhatsAppInline[] {
  if (depth >= 4) return [{ kind: "text", text }];
  const parts: WhatsAppInline[] = [];
  let from = 0;

  for (let index = 0; index < text.length; index += 1) {
    for (const [marker, kind] of MARKERS) {
      if (!text.startsWith(marker, index)) continue;
      if (
        kind !== "code" &&
        (WORD.test(text[index - 1] ?? "") ||
          /\s/.test(text[index + marker.length] ?? ""))
      )
        continue;
      let end = text.indexOf(marker, index + marker.length);

      while (
        end !== -1 &&
        kind !== "code" &&
        (WORD.test(text[end + marker.length] ?? "") ||
          /\s/.test(text[end - 1] ?? ""))
      ) {
        end = text.indexOf(marker, end + marker.length);
      }

      if (end === -1 || end === index + marker.length) continue;
      if (from < index)
        parts.push({ kind: "text", text: text.slice(from, index) });
      const inner = text.slice(index + marker.length, end);
      parts.push(
        kind === "code"
          ? { kind, text: inner }
          : { kind, children: parseWhatsAppInline(inner, depth + 1) }
      );
      index = end + marker.length - 1;
      from = index + 1;
      break;
    }
  }

  if (from < text.length) parts.push({ kind: "text", text: text.slice(from) });

  return parts;
}

export function parseWhatsAppText(text: string): WhatsAppBlock[] {
  // Protect multiline monospace from line-based list/quote recognition.
  const lines = text.match(/```[\s\S]*?```|[^\n`]+|`|\n/g) ?? [];
  const joined: string[] = [];
  let line = "";

  for (const segment of lines) {
    if (segment === "\n") {
      joined.push(line);
      line = "";
    } else line += segment;
  }

  joined.push(line);

  return joined.map((value) => {
    const bullet = /^[*-] (.*)$/s.exec(value);
    if (bullet)
      return { kind: "bullet", content: parseWhatsAppInline(bullet[1]!) };
    const numbered = /^(\d+)\. (.*)$/s.exec(value);
    if (numbered)
      return {
        kind: "number",
        number: Number(numbered[1]),
        content: parseWhatsAppInline(numbered[2]!),
      };
    const quote = /^> (.*)$/s.exec(value);
    if (quote)
      return { kind: "quote", content: parseWhatsAppInline(quote[1]!) };

    return { kind: "paragraph", content: parseWhatsAppInline(value) };
  });
}
