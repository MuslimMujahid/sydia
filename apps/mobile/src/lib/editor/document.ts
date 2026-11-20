import type { TiptapDoc } from "@/lib/services/api/daily-notes/daily-notes.api";

/**
 * Plain-text projection of a Tiptap document, ported from the web's
 * workspace editor. Used for conflict comparison and the read-only fallback
 * when a document contains content this app cannot edit.
 */
export function readableText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  if ("type" in value && value.type === "hardBreak") return "\n";
  if ("text" in value && typeof value.text === "string") return value.text;
  if (
    "type" in value &&
    value.type === "noteLink" &&
    "attrs" in value &&
    value.attrs &&
    typeof value.attrs === "object" &&
    "label" in value.attrs &&
    typeof value.attrs.label === "string"
  )
    return `[[${value.attrs.label}]]`;
  if ("content" in value && Array.isArray(value.content))
    return value.content
      .map(readableText)
      .join(
        "type" in value &&
          ["doc", "bulletList", "orderedList"].includes(String(value.type))
          ? "\n\n"
          : ""
      );

  return "";
}

export const EMPTY_DOCUMENT: TiptapDoc = { type: "doc", content: [] };

/** True when the document has no text, links, or non-paragraph blocks. */
export function isEmptyDocument(doc: TiptapDoc | null | undefined): boolean {
  if (!doc?.content?.length) return true;

  return doc.content.every(
    (node) =>
      node.type === "paragraph" &&
      (!Array.isArray(node.content) || node.content.length === 0)
  );
}

/** Note link targets referenced anywhere in a document. */
export function noteLinkTargets(value: unknown): string[] {
  const targets = new Set<string>();

  function visit(node: unknown) {
    if (!node || typeof node !== "object") return;
    if (
      "type" in node &&
      node.type === "noteLink" &&
      "attrs" in node &&
      node.attrs &&
      typeof node.attrs === "object" &&
      "target" in node.attrs &&
      typeof node.attrs.target === "string"
    )
      targets.add(node.attrs.target);
    if ("content" in node && Array.isArray(node.content))
      node.content.forEach(visit);
  }

  visit(value);

  return [...targets];
}
