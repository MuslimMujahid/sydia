import { plainTextToNotesHtml } from "./event-notes";

const SUPPORTED_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "br",
  "hr",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "del",
  "strike",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
]);
const VOID_TAGS = new Set(["br", "hr"]);
const MARKUP = /<!--[^]*?-->|<\/?[a-z][^<>]*>|<![^<>]*>|<\?[^<>]*>/gi;
const TAG = /^<(\/?)([a-z][a-z\d]*)([^<>]*?)(\/?)>$/i;
const ATTRIBUTE = /\s+([a-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

export function isEventNoteLink(value: string): boolean {
  return /^(?:https?:\/\/[^\s<>"']+|(?:mailto|tel):[^\s<>"']+)$/i.test(value);
}

function supportsAttribute(tag: string, name: string, value: string): boolean {
  if (tag === "a")
    return (
      (name === "href" && isEventNoteLink(value)) ||
      (name === "target" && value === "_blank") ||
      (name === "rel" &&
        /^(?:noopener|noreferrer|nofollow)(?: (?:noopener|noreferrer|nofollow))*$/.test(
          value
        ))
    );
  if (tag === "ol") return name === "start" && /^\d+$/.test(value);
  if (tag === "code")
    return name === "class" && /^language-[\w+-]+$/.test(value);
  return false;
}

function supportsAttributes(tag: string, source: string): boolean {
  const seen = new Set<string>();
  let offset = 0;
  for (const match of source.matchAll(ATTRIBUTE)) {
    const name = match[1]!.toLowerCase();
    const value = match[2] ?? match[3]!;
    if (
      match.index !== offset ||
      seen.has(name) ||
      !supportsAttribute(tag, name, value)
    )
      return false;
    seen.add(name);
    offset += match[0].length;
  }

  return (
    source.slice(offset).trim() === "" && (tag !== "a" || seen.has("href"))
  );
}

type EditableEventNotes =
  { kind: "editable"; html: string } | { kind: "unsupported" };

/**
 * Hand basic Tiptap-compatible HTML to the rich editor unchanged. Unknown
 * markup and attributes stay read-only so saving unrelated event fields
 * cannot silently remove content or load embedded resources in the WebView.
 */
export function editableEventNotes(
  value: string | null | undefined
): EditableEventNotes {
  const source = value ?? "";
  const matches = [...source.matchAll(MARKUP)];
  if (matches.length === 0)
    return {
      kind: "editable",
      html: plainTextToNotesHtml(source),
    };

  const openTags: string[] = [];
  let offset = 0;
  for (const match of matches) {
    const tag = TAG.exec(match[0]);
    if (!tag || source.slice(offset, match.index).includes("<"))
      return { kind: "unsupported" };
    const [, closing, name, attributes, selfClosing] = tag;
    const element = name!.toLowerCase();
    if (!SUPPORTED_TAGS.has(element)) return { kind: "unsupported" };
    if (closing) {
      if (selfClosing || attributes?.trim() || openTags.pop() !== element)
        return { kind: "unsupported" };
    } else {
      if (!supportsAttributes(element, attributes ?? ""))
        return { kind: "unsupported" };
      if (!VOID_TAGS.has(element)) {
        if (selfClosing) return { kind: "unsupported" };
        openTags.push(element);
      }
    }
    offset = match.index + match[0].length;
  }

  return openTags.length || source.slice(offset).includes("<")
    ? { kind: "unsupported" }
    : { kind: "editable", html: source };
}
