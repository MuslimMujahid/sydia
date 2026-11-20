import type { Extensions } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { StarterKit } from "@tiptap/starter-kit";
import { NoteLink } from "./note-link";

export const DEFAULT_PLACEHOLDER = "Mulai dari hal yang ingin Anda ingat.";

/**
 * Exactly the web workspace editor's schema (workspace-editor.tsx): StarterKit
 * with headings 1–3 and non-navigating links, plus note links. Placeholder
 * adds no schema; it only decorates an empty document.
 */
export function createExtensions(
  placeholder = DEFAULT_PLACEHOLDER,
  { noteLinks = true }: { noteLinks?: boolean } = {}
): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, defaultProtocol: "https" },
    }),
    ...(noteLinks ? [NoteLink] : []),
    Placeholder.configure({ placeholder }),
  ];
}
