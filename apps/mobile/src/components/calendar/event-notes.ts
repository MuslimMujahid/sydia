/**
 * Event descriptions follow the web's contract: Google Calendar descriptions
 * (and anything the web editor saved) are HTML; legacy notes are plain text
 * that stays literal. The phone edits notes as plain text and writes the
 * same paragraph HTML the web editor produces.
 */

const HTML_PATTERN =
  /<\/?(?:p|div|br|b|strong|i|em|u|s|a|ul|ol|li|h[1-6]|blockquote|pre|code|span)\b[^>]*>/i;

/** Whether the stored notes are HTML rather than legacy plain text. */
export function isHtmlNotes(value: string): boolean {
  return HTML_PATTERN.test(value);
}

/** Whether HTML notes carry formatting that plain-text editing would drop. */
export function hasRichFormatting(value: string): boolean {
  return /<(?:b|strong|i|em|u|s|a|ul|ol|li|h[1-6]|blockquote|pre|code)\b/i.test(
    value
  );
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, entity: string) => {
      if (entity[0] === "#") {
        const code =
          entity[1]?.toLowerCase() === "x"
            ? Number.parseInt(entity.slice(2), 16)
            : Number.parseInt(entity.slice(1), 10);

        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }

      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    }
  );
}

/**
 * Readable text for display and editing. HTML loses its tags (keeping line
 * structure and link targets); plain text is returned as it was saved.
 */
export function notesToPlainText(value: string | null | undefined): string {
  if (!value) return "";
  if (!isHtmlNotes(value)) return value;

  const text = value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(
      /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
      (_match, _quote, href: string, label: string) => {
        const plainLabel = label.replace(/<[^>]+>/g, "").trim();
        const target = decodeEntities(href.trim());

        return !plainLabel || plainLabel === target
          ? target
          : `${plainLabel} (${target})`;
      }
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Paragraph HTML for plain text typed on the phone, matching the web editor's
 * `getHTML()` output: one `<p>` per line and an empty string for no notes.
 */
export function plainTextToNotesHtml(text: string): string {
  const trimmed = text.replace(/\s+$/, "");
  if (!trimmed.trim()) return "";

  return trimmed
    .split("\n")
    .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "<p></p>"))
    .join("");
}

/** A one-line preview of the notes. */
export function notesSummary(value: string | null | undefined): string {
  return notesToPlainText(value).replace(/\s+/g, " ").trim();
}
