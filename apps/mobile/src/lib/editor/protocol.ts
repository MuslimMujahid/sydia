import type { TiptapDoc } from "@/lib/services/api/daily-notes/daily-notes.api";

/**
 * Message protocol between the native screen and the Tiptap editor that runs
 * inside the WebView (apps/mobile/editor). Both sides import these types, so
 * this module must stay free of React Native imports.
 */

export type EditorCommand =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "blockquote"
  | "codeBlock"
  | "horizontalRule"
  | "undo"
  | "redo";

export type EditorBlock =
  "paragraph" | "heading1" | "heading2" | "heading3" | "codeBlock" | "other";

export type EditorActiveState = {
  block: EditorBlock;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  bulletList: boolean;
  orderedList: boolean;
  blockquote: boolean;
  /** The href under the cursor, when the selection is inside a link. */
  link: string | null;
  canUndo: boolean;
  canRedo: boolean;
};

/** `[[query` typed before the cursor; `from`/`to` cover the typed text. */
export type EditorLinkQuery = { query: string; from: number; to: number };

/** Where a chosen note link replaces existing content. */
export type EditorLinkRange =
  | { kind: "range"; from: number; to: number }
  | { kind: "node"; position: number };

export type EditorHeading = { title: string; subtitle?: string };

/** Native → WebView. */
export type EditorInbound =
  | {
      type: "init";
      content: TiptapDoc | null;
      /** Opts into HTML storage for calendar descriptions. */
      html?: string;
      editable: boolean;
      placeholder: string;
      /** Editable title shown above the body; null hides the title field. */
      title: string | null;
      titlePlaceholder: string;
      /** Read-only heading for daily notes, used when `title` is null. */
      heading: EditorHeading | null;
      knownRefs: string[];
      focus: "title" | "editor" | null;
    }
  | { type: "setContent"; content: TiptapDoc; title?: string }
  | { type: "setEditable"; editable: boolean }
  | { type: "setKnownRefs"; refs: string[] }
  | { type: "command"; command: EditorCommand }
  | { type: "setLink"; href: string | null }
  | {
      type: "insertNoteLink";
      target: string | null;
      label: string;
      range: EditorLinkRange | null;
    }
  | { type: "focus"; target: "title" | "editor" }
  | { type: "blur" }
  | { type: "flush"; id: number };

/** WebView → native. */
export type EditorOutbound =
  | { type: "ready" }
  | { type: "loaded"; empty: boolean }
  | { type: "contentError"; message: string }
  | { type: "pendingChange" }
  | { type: "change"; content: TiptapDoc; empty: boolean; html?: string }
  | { type: "title"; title: string }
  | { type: "state"; state: EditorActiveState }
  | { type: "focus"; target: "title" | "editor" }
  | { type: "blur" }
  | { type: "linkQuery"; query: EditorLinkQuery | null }
  | {
      type: "noteLinkTap";
      target: string | null;
      label: string;
      position: number;
    }
  | { type: "linkTap"; href: string }
  | { type: "flushed"; id: number }
  | { type: "log"; level: "warn" | "error"; message: string };

export const EMPTY_ACTIVE_STATE: EditorActiveState = {
  block: "paragraph",
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  code: false,
  bulletList: false,
  orderedList: false,
  blockquote: false,
  link: null,
  canUndo: false,
  canRedo: false,
};
