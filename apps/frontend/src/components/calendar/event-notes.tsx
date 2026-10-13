import {
  EditorContent,
  useEditor,
  useEditorState,
  type JSONContent,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";
import { DailyNoteToolbar } from "@/components/daily-notes/daily-note-toolbar";
import { cn } from "@/lib/utils/cn";

const NOTES_TYPOGRAPHY =
  "break-words [overflow-wrap:anywhere] [&_.tiptap]:outline-none [&_.tiptap_p]:whitespace-pre-wrap [&_.tiptap>*+*]:mt-2 [&_.tiptap_h1]:text-xl [&_.tiptap_h2]:text-lg [&_.tiptap_h3]:text-base [&_.tiptap_:is(h1,h2,h3)]:font-semibold [&_.tiptap_ul]:list-disc [&_.tiptap_ol]:list-decimal [&_.tiptap_:is(ul,ol)]:pl-5 [&_.tiptap_a]:text-link [&_.tiptap_a]:underline [&_.tiptap_blockquote]:border-l-2 [&_.tiptap_blockquote]:border-hairline [&_.tiptap_blockquote]:pl-3 [&_.tiptap_pre]:overflow-x-auto [&_.tiptap_pre]:bg-surface-1 [&_.tiptap_pre]:p-2";

// Google Calendar descriptions support HTML. Legacy plain text stays literal,
// including angle brackets, until the user actually edits the document.
function notesContent(value: string): string | JSONContent {
  if (
    /<\/?(?:p|div|br|b|strong|i|em|u|s|a|ul|ol|li|h[1-6]|blockquote|pre|code|span)\b[^>]*>/i.test(
      value
    )
  )
    return value;

  return {
    type: "doc",
    content: value.split("\n").map((line) => ({
      type: "paragraph",
      ...(line ? { content: [{ type: "text", text: line }] } : {}),
    })),
  };
}

export function eventNotesSummary(value: string): string {
  if (typeof notesContent(value) !== "string") return value;
  if (typeof DOMParser === "undefined") return "Catatan berformat";

  const document = new DOMParser().parseFromString(value, "text/html");
  document.querySelectorAll("script, style").forEach((node) => node.remove());
  document
    .querySelectorAll("p, div, br, li, h1, h2, h3")
    .forEach((node) => node.append(" "));

  return document.body.textContent?.trim() ?? "";
}

interface EventNotesEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}

export function EventNotesEditor({
  value,
  onChange,
  onBlur,
}: EventNotesEditorProps) {
  const [initialContent] = useState(() => notesContent(value));
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false },
      }),
    ],
    content: initialContent,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        id: "event-description",
        role: "textbox",
        "aria-label": "Catatan",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: current }) =>
      onChange(current.isEmpty ? "" : current.getHTML()),
    onBlur,
  });

  const isEmpty = useEditorState({
    editor,
    selector: ({ editor: current }) => current?.isEmpty ?? true,
  });

  return (
    <div
      className="overflow-hidden rounded-sm border border-ink/16 bg-canvas focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15"
      aria-busy={!editor}
    >
      {editor ? (
        <div className="border-b border-hairline">
          <DailyNoteToolbar editor={editor} />
        </div>
      ) : null}
      <div className="relative">
        {isEmpty ? (
          <p
            aria-hidden="true"
            className="pointer-events-none absolute top-3 left-3 text-sm text-ink-muted"
          >
            Tambahkan catatan atau tautan.
          </p>
        ) : null}
        <EditorContent
          editor={editor}
          className={cn(
            NOTES_TYPOGRAPHY,
            "min-h-28 text-sm leading-relaxed [&_.tiptap]:min-h-28 [&_.tiptap]:px-3 [&_.tiptap]:py-3"
          )}
        />
      </div>
    </div>
  );
}

/** Tiptap parses provider HTML into its schema; arbitrary HTML is never rendered. */
interface EventNotesProps {
  value: string;
}

export function EventNotes({ value }: EventNotesProps) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } })],
    content: notesContent(value),
    editable: false,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
  });

  return editor ? (
    <EditorContent
      editor={editor}
      className={cn(NOTES_TYPOGRAPHY, "max-h-48 overflow-y-auto")}
    />
  ) : (
    <p className="whitespace-pre-line">{eventNotesSummary(value)}</p>
  );
}
