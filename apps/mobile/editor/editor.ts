import {
  createDocument,
  Editor,
  Extension,
  getSchema,
  type JSONContent,
} from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type {
  EditorActiveState,
  EditorBlock,
  EditorCommand,
  EditorHeading,
  EditorInbound,
  EditorLinkQuery,
  EditorLinkRange,
  EditorOutbound,
} from "../src/lib/editor/protocol";
import type { TiptapDoc } from "../src/lib/services/api/daily-notes/daily-notes.api";
import { createExtensions } from "./schema";

/**
 * Runs inside the note WebView. Native code drives it through
 * `window.sydiaEditor.receive(...)` and listens to `ReactNativeWebView`
 * messages; see src/lib/editor/protocol.ts for the contract.
 */

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(message: string): void };
    sydiaEditor?: { receive(message: EditorInbound): void };
  }
}

const CHANGE_DELAY_MS = 250;

function post(message: EditorOutbound) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

window.addEventListener("error", (event) => {
  post({ type: "log", level: "error", message: String(event.message) });
});

const titleField = document.getElementById("title") as HTMLTextAreaElement;
const headingBlock = document.getElementById("heading") as HTMLElement;
const headingTitle = document.getElementById("heading-title") as HTMLElement;
const headingSubtitle = document.getElementById(
  "heading-subtitle"
) as HTMLElement;
const host = document.getElementById("editor") as HTMLElement;

let editor: Editor | null = null;
let storesHtml = false;
let knownRefs = new Set<string>();
let refsLoaded = false;
let changeTimer: ReturnType<typeof setTimeout> | undefined;
let lastState = "";
let lastLinkQuery = "null";
let focusedTarget: "title" | "editor" | null = null;

/** Marks links whose destination is not (or no longer) a known note. */
const missingKey = new PluginKey<DecorationSet>("missingNoteLinks");

function missingLinks(doc: ProseMirrorNode): DecorationSet {
  if (!refsLoaded) return DecorationSet.empty;
  const decorations: Decoration[] = [];

  doc.descendants((node, position) => {
    if (node.type.name !== "noteLink") return;
    const target: unknown = node.attrs.target;
    if (typeof target !== "string" || !knownRefs.has(target))
      decorations.push(
        Decoration.node(position, position + node.nodeSize, {
          class: "note-link-missing",
        })
      );
  });

  return DecorationSet.create(doc, decorations);
}

const MissingNoteLinks = Extension.create({
  name: "missingNoteLinks",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: missingKey,
        state: {
          init: (_config, state) => missingLinks(state.doc),
          apply: (transaction, previous) =>
            transaction.docChanged || transaction.getMeta(missingKey)
              ? missingLinks(transaction.doc)
              : previous,
        },
        props: {
          decorations(state) {
            return missingKey.getState(state);
          },
        },
      }),
    ];
  },
});

function autosizeTitle() {
  titleField.style.height = "auto";
  titleField.style.height = `${titleField.scrollHeight}px`;
}

function blockOf(current: Editor): EditorBlock {
  if (current.isActive("heading", { level: 1 })) return "heading1";
  if (current.isActive("heading", { level: 2 })) return "heading2";
  if (current.isActive("heading", { level: 3 })) return "heading3";
  if (current.isActive("codeBlock")) return "codeBlock";
  if (current.isActive("paragraph")) return "paragraph";

  return "other";
}

function reportState() {
  if (!editor) return;
  const href: unknown = editor.isActive("link")
    ? editor.getAttributes("link").href
    : null;
  const state: EditorActiveState = {
    block: blockOf(editor),
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    strike: editor.isActive("strike"),
    code: editor.isActive("code"),
    bulletList: editor.isActive("bulletList"),
    orderedList: editor.isActive("orderedList"),
    blockquote: editor.isActive("blockquote"),
    link: typeof href === "string" && href ? href : null,
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
  };
  const serialized = JSON.stringify(state);
  if (serialized === lastState) return;
  lastState = serialized;
  post({ type: "state", state });
}

function reportLinkQuery(query: EditorLinkQuery | null) {
  const serialized = JSON.stringify(query);
  if (serialized === lastLinkQuery) return;
  lastLinkQuery = serialized;
  post({ type: "linkQuery", query });
}

/** `[[label` typed before the caret opens the native note-link picker. */
function detectLinkQuery() {
  if (!editor || !editor.isEditable || storesHtml) return reportLinkQuery(null);
  const { selection } = editor.state;
  if (!selection.empty) return reportLinkQuery(null);
  const before = selection.$from.parent.textBetween(
    0,
    selection.$from.parentOffset,
    "",
    "￼"
  );
  const match = /\[\[([^[\]]*)$/.exec(before);

  reportLinkQuery(
    match
      ? {
          query: match[1] ?? "",
          from: selection.from - match[0].length,
          to: selection.from,
        }
      : null
  );
}

function emitChange() {
  if (changeTimer) clearTimeout(changeTimer);
  changeTimer = undefined;
  if (!editor) return;
  post({
    type: "change",
    content: editor.getJSON() as TiptapDoc,
    empty: editor.isEmpty,
    ...(storesHtml ? { html: editor.isEmpty ? "" : editor.getHTML() } : {}),
  });
}

function scheduleChange() {
  if (changeTimer) clearTimeout(changeTimer);
  else post({ type: "pendingChange" });
  changeTimer = setTimeout(emitChange, CHANGE_DELAY_MS);
}

/** An empty document has no valid block yet; let Tiptap create its paragraph. */
function normalizedContent(content: TiptapDoc | null): JSONContent | null {
  if (!content?.content?.length) return null;

  return content as JSONContent;
}

/** Throws for node or mark types this schema does not know (never drop them). */
function assertSupported(content: JSONContent | null, placeholder: string) {
  if (!content) return;
  getSchema(createExtensions(placeholder)).nodeFromJSON(content);
}

function showChrome(title: string | null, heading: EditorHeading | null) {
  if (title !== null) {
    titleField.hidden = false;
    headingBlock.hidden = true;
    titleField.value = title;
    requestAnimationFrame(autosizeTitle);
  } else {
    titleField.hidden = true;
    headingBlock.hidden = !heading;
    headingTitle.textContent = heading?.title ?? "";
    headingSubtitle.textContent = heading?.subtitle ?? "";
    headingSubtitle.hidden = !heading?.subtitle;
  }
}

function run(command: EditorCommand) {
  if (!editor) return;
  const chain = editor.chain().focus();

  switch (command) {
    case "bold":
      chain.toggleBold();
      break;
    case "italic":
      chain.toggleItalic();
      break;
    case "underline":
      chain.toggleUnderline();
      break;
    case "strike":
      chain.toggleStrike();
      break;
    case "code":
      chain.toggleCode();
      break;
    case "paragraph":
      chain.setParagraph();
      break;
    case "heading1":
      chain.toggleHeading({ level: 1 });
      break;
    case "heading2":
      chain.toggleHeading({ level: 2 });
      break;
    case "heading3":
      chain.toggleHeading({ level: 3 });
      break;
    case "bulletList":
      chain.toggleBulletList();
      break;
    case "orderedList":
      chain.toggleOrderedList();
      break;
    case "blockquote":
      chain.toggleBlockquote();
      break;
    case "codeBlock":
      chain.toggleCodeBlock();
      break;
    case "horizontalRule":
      chain.setHorizontalRule();
      break;
    case "undo":
      chain.undo();
      break;
    case "redo":
      chain.redo();
      break;
  }

  chain.run();
}

function setLink(href: string | null) {
  if (!editor) return;
  const chain = editor.chain().focus().extendMarkRange("link");

  if (!href) {
    chain.unsetLink().run();

    return;
  }

  if (editor.state.selection.empty && !editor.isActive("link")) {
    chain
      .insertContent({
        type: "text",
        text: href,
        marks: [{ type: "link", attrs: { href } }],
      })
      .run();

    return;
  }

  chain.setLink({ href }).run();
}

function insertNoteLink(
  target: string | null,
  label: string,
  range: EditorLinkRange | null
) {
  if (!editor) return;
  const chain = editor.chain().focus();
  if (range?.kind === "node")
    chain.setNodeSelection(range.position).deleteSelection();
  else if (range?.kind === "range")
    chain.deleteRange({ from: range.from, to: range.to });
  chain.insertContent({ type: "noteLink", attrs: { target, label } }).run();
}

function createEditor(message: Extract<EditorInbound, { type: "init" }>) {
  storesHtml = message.html !== undefined;
  const extensions = createExtensions(message.placeholder, {
    noteLinks: !storesHtml,
  });
  let content = normalizedContent(message.content);

  try {
    if (message.html !== undefined) {
      const schema = getSchema(extensions);
      const document = createDocument(
        message.html,
        schema,
        { preserveWhitespace: true },
        { errorOnInvalidContent: true }
      );
      document.check();
      content = document.toJSON() as TiptapDoc;
    } else assertSupported(content, message.placeholder);
  } catch (failure) {
    post({
      type: "contentError",
      message: storesHtml
        ? "Unsupported calendar description"
        : failure instanceof Error
          ? failure.message
          : String(failure),
    });

    return;
  }

  knownRefs = new Set(message.knownRefs);
  refsLoaded = message.knownRefs.length > 0;
  showChrome(message.title, message.heading);
  titleField.placeholder = message.titlePlaceholder;
  titleField.readOnly = !message.editable;

  editor = new Editor({
    element: host,
    extensions: storesHtml ? extensions : [...extensions, MissingNoteLinks],
    content,
    editable: message.editable,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Isi catatan",
        "aria-multiline": "true",
        autocapitalize: "sentences",
        spellcheck: "true",
      },
      handleClickOn: (_view, _position, node, nodePosition) => {
        if (node.type.name !== "noteLink") return false;
        const target: unknown = node.attrs.target;
        const label: unknown = node.attrs.label;
        post({
          type: "noteLinkTap",
          target: typeof target === "string" ? target : null,
          label: typeof label === "string" ? label : "",
          position: nodePosition,
        });

        return true;
      },
      handleClick: (_view, _position, event) => {
        if (!editor || editor.isEditable) return false;
        const anchor = (event.target as HTMLElement | null)?.closest("a[href]");
        const href = anchor?.getAttribute("href");
        if (!href) return false;
        event.preventDefault();
        post({ type: "linkTap", href });

        return true;
      },
    },
    onUpdate: () => {
      scheduleChange();
      detectLinkQuery();
    },
    onSelectionUpdate: () => {
      detectLinkQuery();
      reportState();
    },
    onTransaction: () => reportState(),
    onFocus: () => {
      focusedTarget = "editor";
      post({ type: "focus", target: "editor" });
    },
    onBlur: () => {
      if (changeTimer) emitChange();
      reportLinkQuery(null);
      // A blur that moves focus to the title is reported by the title.
      setTimeout(() => {
        if (focusedTarget === "editor") {
          focusedTarget = null;
          post({ type: "blur" });
        }
      }, 0);
    },
  });

  reportState();
  post({ type: "loaded", empty: editor.isEmpty });

  if (message.focus === "title" && message.title !== null) {
    titleField.focus();
    titleField.select();
  } else if (message.focus === "editor") editor.commands.focus("end");
}

titleField.addEventListener("input", () => {
  const value = titleField.value.replace(/[\r\n]/g, " ");
  if (value !== titleField.value) titleField.value = value;
  autosizeTitle();
  post({ type: "title", title: value });
});

titleField.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  editor?.commands.focus("start");
});

titleField.addEventListener("focus", () => {
  focusedTarget = "title";
  post({ type: "focus", target: "title" });
});

titleField.addEventListener("blur", () => {
  setTimeout(() => {
    if (focusedTarget === "title") {
      focusedTarget = null;
      post({ type: "blur" });
    }
  }, 0);
});

// The native keyboard shrinks the WebView; keep the caret in view.
window.addEventListener("resize", () => {
  autosizeTitle();
  if (editor?.isFocused) editor.commands.scrollIntoView();
});

window.sydiaEditor = {
  receive(message: EditorInbound) {
    try {
      switch (message.type) {
        case "init":
          if (!editor) createEditor(message);
          break;
        case "setContent": {
          if (!editor) break;
          const content = normalizedContent(message.content);
          try {
            assertSupported(content, "");
          } catch (failure) {
            post({
              type: "contentError",
              message:
                failure instanceof Error ? failure.message : String(failure),
            });
            break;
          }
          if (changeTimer) clearTimeout(changeTimer);
          changeTimer = undefined;
          editor.commands.setContent(content ?? "", { emitUpdate: false });
          if (
            message.title !== undefined &&
            document.activeElement !== titleField
          ) {
            titleField.value = message.title;
            autosizeTitle();
          }
          reportState();
          break;
        }
        case "setEditable":
          editor?.setEditable(message.editable, false);
          titleField.readOnly = !message.editable;
          reportState();
          break;
        case "setKnownRefs":
          knownRefs = new Set(message.refs);
          refsLoaded = true;
          if (editor)
            editor.view.dispatch(editor.state.tr.setMeta(missingKey, true));
          break;
        case "command":
          run(message.command);
          break;
        case "setLink":
          setLink(message.href);
          break;
        case "insertNoteLink":
          insertNoteLink(message.target, message.label, message.range);
          break;
        case "focus":
          if (message.target === "title" && !titleField.hidden) {
            titleField.focus();
          } else editor?.commands.focus();
          break;
        case "blur":
          editor?.commands.blur();
          titleField.blur();
          break;
        case "flush":
          if (changeTimer) emitChange();
          post({ type: "flushed", id: message.id });
          break;
      }
    } catch (failure) {
      post({
        type: "log",
        level: "error",
        message: failure instanceof Error ? failure.message : String(failure),
      });
    }
  },
};

post({ type: "ready" });
