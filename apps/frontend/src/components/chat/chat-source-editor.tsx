import {
  ENTITY_PILL_BASE_CLASS_NAME,
  ENTITY_PILL_STYLES,
} from "./entity-pill-styles";
import { Node, mergeAttributes } from "@tiptap/react";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type NodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
  type MouseEventHandler,
} from "react";
import { CalendarDays, Folder, NotebookPen, X } from "lucide-react";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";
import { cn } from "@/lib/utils/cn";
import { ChatSourceSelector } from "./chat-source-selector";
import {
  composerSegments,
  segmentText,
  type ChatSegment,
  type ChatSource,
} from "./chat-source-types";

function SourceNode({ node, deleteNode, editor, selected }: NodeViewProps) {
  const source = node.attrs.source as ChatSource;

  return (
    <NodeViewWrapper
      as="span"
      className="inline-flex max-w-full align-middle"
      contentEditable={false}
    >
      <SourceChip
        source={source}
        locale={node.attrs.locale as SupportedLocale}
        selected={selected}
        onRemove={editor.isEditable ? deleteNode : undefined}
      />
    </NodeViewWrapper>
  );
}

export function SourceChip({
  source,
  onRemove,
  onOpen,
  locale = "id",
  selected = false,
}: {
  source: ChatSource;
  onRemove?: () => void;
  onOpen?: MouseEventHandler<HTMLButtonElement>;
  locale?: SupportedLocale;
  selected?: boolean;
}) {
  const style = ENTITY_PILL_STYLES[source.kind === "note" ? "note" : "file"];
  const Icon =
    source.kind === "folder"
      ? Folder
      : source.kind === "note" && source.id.startsWith("daily:")
        ? CalendarDays
        : style.icon;

  const label =
    source.kind === "note" &&
    source.id.startsWith("daily:") &&
    source.label === source.id.slice(6)
      ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${source.id.slice(6)}T12:00:00Z`))
      : source.label;

  if (onOpen && source.kind === "note") {
    return (
      <button
        type="button"
        title={source.path ? `${source.path} / ${label}` : label}
        aria-label={`${locale === "en" ? "Note" : "Catatan"}: ${label}`}
        className={cn(
          ENTITY_PILL_BASE_CLASS_NAME,
          "m-0.5 cursor-pointer align-middle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          style.color
        )}
        onClick={onOpen}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="max-w-[240px] truncate">{label}</span>
      </button>
    );
  }

  return (
    <span
      title={source.path ? `${source.path} / ${label}` : label}
      className={cn(
        ENTITY_PILL_BASE_CLASS_NAME,
        "m-0.5 align-middle",
        style.color,
        selected && "outline-2 outline-brand/50"
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="max-w-[240px] truncate">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${locale === "en" ? "Remove source" : "Hapus sumber"} ${label}`}
          className="-mr-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-current opacity-70 hover:bg-ink/8 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-brand"
        >
          <X className="size-3.5" />
        </button>
      )}
    </span>
  );
}

const sourceNode = Node.create({
  name: "chatSource",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    source: { default: null, rendered: false },
    locale: { default: "id" },
  }),
  // Source identities can only be inserted through confirmed selections, never pasted HTML.
  parseHTML: () => [],
  renderHTML: ({ node, HTMLAttributes }) => [
    "span",
    mergeAttributes(HTMLAttributes, { "data-chat-source": "" }),
    (node.attrs.source as ChatSource).label,
  ],
  addNodeView: () => ReactNodeViewRenderer(SourceNode),
});

export interface ChatSourceEditorHandle {
  clear: () => void;
}
interface ChatSourceEditorProps {
  ref?: Ref<ChatSourceEditorHandle>;
  locale: SupportedLocale;
  disabled: boolean;
  embedded: boolean;
  onChange: (text: string, segments: ChatSegment[]) => void;
  onSubmit: () => void;
}

export function ChatSourceEditor({
  ref,
  locale,
  disabled,
  embedded,
  onChange,
  onSubmit,
}: ChatSourceEditorProps) {
  const [menu, setMenu] = useState(false);
  const [active, setActive] = useState(0);
  const [selector, setSelector] = useState<"files" | "notes">();
  const trigger = useRef<{ from: number; to: number }>({ from: 1, to: 1 });
  const menuRef = useRef(false);
  const activeRef = useRef(0);
  const callbacks = useRef({ onChange, onSubmit });
  useEffect(() => {
    callbacks.current = { onChange, onSubmit };
  }, [onChange, onSubmit]);
  const openSelector = useRef<(kind: "files" | "notes") => void>(() => {});

  function showMenu(open: boolean) {
    menuRef.current = open;
    setMenu(open);
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
        horizontalRule: false,
        bold: false,
        italic: false,
        strike: false,
        code: false,
        link: false,
        underline: false,
      }),
      sourceNode,
    ],
    editable: !disabled,
    content: { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label":
          locale === "en" ? "Message for Sydia" : "Pesan untuk Sydia",
        class:
          "min-h-8.5 px-2 py-1.25 text-[15px] leading-6 outline-none break-words [overflow-wrap:anywhere]",
      },
      handleKeyDown: (_view, event) => {
        if (event.isComposing) return false;

        if (menuRef.current) {
          if (event.key === "Escape") {
            showMenu(false);

            return true;
          }

          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            activeRef.current = 1 - activeRef.current;
            setActive(activeRef.current);

            return true;
          }

          if (event.key === "Enter" || event.key === "Tab") {
            openSelector.current(activeRef.current === 0 ? "files" : "notes");

            return true;
          }
        }

        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          !window.matchMedia("(pointer: coarse)").matches
        ) {
          callbacks.current.onSubmit();

          return true;
        }

        return false;
      },
    },
    onUpdate: ({ editor: current }) => {
      const segments = composerSegments(current.getJSON());
      callbacks.current.onChange(segmentText(segments), segments);
      const pos = current.state.selection.from;
      const before = current.state.doc.textBetween(
        Math.max(0, pos - 2),
        pos,
        "\n",
        "\uFFFC"
      );

      if (/(?:^|\s)@$/.test(before)) {
        trigger.current = { from: pos - 1, to: pos };
        activeRef.current = 0;
        setActive(0);
        showMenu(true);
      } else showMenu(false);
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);
  useImperativeHandle(
    ref,
    () => ({ clear: () => editor?.commands.clearContent() }),
    [editor]
  );

  useEffect(() => {
    openSelector.current = (kind) => {
      menuRef.current = false;
      setMenu(false);
      setSelector(kind);
    };
  }, []);

  function restore() {
    setSelector(undefined);
    editor?.commands.setTextSelection(trigger.current.to);
  }

  function insert(sources: ChatSource[]) {
    setSelector(undefined);
    editor
      ?.chain()
      .focus()
      .insertContentAt(
        trigger.current,
        sources.flatMap((source) => [
          { type: "chatSource", attrs: { source, locale } },
          { type: "text", text: " " },
        ])
      )
      .run();
  }

  return (
    <div className="min-w-0 flex-1 self-stretch">
      <div className="relative">
        <EditorContent
          editor={editor}
          className={cn(
            "[&_.tiptap_p]:m-0 [&_.tiptap_p]:min-h-6 [&_.tiptap_p.is-editor-empty:first-child]:before:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child]:before:float-left [&_.tiptap_p.is-editor-empty:first-child]:before:h-0",
            !embedded && "max-h-[40vh] overflow-y-auto"
          )}
        />
        {editor?.isEmpty && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1.25 left-2 text-[15px] leading-6 text-ink-muted"
          >
            {locale === "en"
              ? "Write a message or attach a file…"
              : "Tulis pesan atau lampirkan file…"}
          </span>
        )}
      </div>
      {menu && (
        <div
          role="menu"
          aria-label={locale === "en" ? "Add sources" : "Tambahkan sumber"}
          className={cn(
            "absolute -inset-x-px z-30 rounded-2xl border border-hairline bg-canvas p-1 shadow-lg",
            embedded ? "top-full mt-2" : "bottom-full mb-2"
          )}
        >
          {(["files", "notes"] as const).map((kind, i) => {
            const Icon = i === 0 ? Folder : NotebookPen;

            return (
              <button
                key={kind}
                type="button"
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => openSelector.current(kind)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    showMenu(false);
                    editor?.commands.focus();
                  }
                }}
                className={cn(
                  "flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] leading-5 focus-visible:outline-2 focus-visible:outline-brand",
                  active === i ? "bg-ink/5" : "hover:bg-ink/5"
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>
                  {i === 0
                    ? locale === "en"
                      ? "Add files and folders"
                      : "Tambah berkas dan folder"
                    : locale === "en"
                      ? "Add notes"
                      : "Tambah catatan"}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {selector && (
        <ChatSourceSelector
          kind={selector}
          locale={locale}
          onClose={restore}
          returnFocus={() => editor?.view.dom ?? false}
          onConfirm={insert}
        />
      )}
    </div>
  );
}
