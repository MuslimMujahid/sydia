import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";
import { DailyNoteToolbar } from "@/components/daily-notes/daily-note-toolbar";
import { cn } from "@/lib/utils/cn";

// Same formatting set as daily notes. Notes are stored as Markdown so the
// value stays readable as plain text for the assistant and older clients.
const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
    },
  }),
  Markdown,
];

const SURFACE_CLASS_NAME =
  "flex flex-col overflow-clip rounded-sm border border-ink/16 bg-canvas hover:border-brand/50 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15";

const CONTENT_CLASS_NAME = "min-h-40 lg:min-h-80";

const NOTES_TYPOGRAPHY = cn(
  "[&_.tiptap]:flex-1 [&_.tiptap]:px-3 [&_.tiptap]:py-3 [&_.tiptap]:text-[15px] [&_.tiptap]:leading-[1.6] [&_.tiptap]:text-ink [&_.tiptap]:outline-none",
  "[&_.tiptap>*+*]:mt-2 [&_.tiptap>h1:not(:first-child)]:mt-5 [&_.tiptap>h2:not(:first-child)]:mt-4 [&_.tiptap>h3:not(:first-child)]:mt-3",
  "[&_.tiptap_h1]:font-display [&_.tiptap_h1]:text-xl [&_.tiptap_h1]:leading-[1.25] [&_.tiptap_h1]:font-semibold [&_.tiptap_h1]:tracking-[-0.015em]",
  "[&_.tiptap_h2]:font-display [&_.tiptap_h2]:text-lg [&_.tiptap_h2]:leading-[1.3] [&_.tiptap_h2]:font-semibold",
  "[&_.tiptap_h3]:font-display [&_.tiptap_h3]:font-semibold",
  "[&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6 [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6 [&_.tiptap_li]:pl-1 [&_.tiptap_li::marker]:text-ink-muted [&_.tiptap_li+li]:mt-1 [&_.tiptap_li>ol]:mt-1 [&_.tiptap_li>ul]:mt-1",
  "[&_.tiptap_a]:text-link [&_.tiptap_a]:underline [&_.tiptap_a]:decoration-link/40 [&_.tiptap_a]:underline-offset-4",
  "[&_.tiptap_blockquote]:border-l-[3px] [&_.tiptap_blockquote]:border-brand/60 [&_.tiptap_blockquote]:pl-4 [&_.tiptap_blockquote]:text-ink-muted",
  "[&_.tiptap_code]:rounded-sm [&_.tiptap_code]:bg-surface-1 [&_.tiptap_code]:px-1 [&_.tiptap_code]:py-0.5 [&_.tiptap_code]:font-mono [&_.tiptap_code]:text-[0.85em]",
  "[&_.tiptap_pre]:overflow-x-auto [&_.tiptap_pre]:rounded-md [&_.tiptap_pre]:bg-editorial [&_.tiptap_pre]:p-3 [&_.tiptap_pre]:font-mono [&_.tiptap_pre]:text-sm [&_.tiptap_pre]:text-canvas [&_.tiptap_pre_code]:bg-transparent [&_.tiptap_pre_code]:p-0 [&_.tiptap_pre_code]:text-inherit",
  "[&_.tiptap_hr]:border-hairline"
);

type TaskNotesEditorProps = {
  id: string;
  /** Accessible name of the writing surface. */
  label: string;
  /** Markdown; plain-text notes from before rich text load as paragraphs. */
  value: string;
  placeholder?: string;
  describedBy?: string;
  invalid?: boolean;
  className?: string;
  /** Receives Markdown, or an empty string when the editor is empty. */
  onChange: (value: string) => void;
  onBlur?: () => void;
};

export function TaskNotesEditor({
  id,
  label,
  value,
  placeholder = "Tambahkan detail, langkah, atau tautan.",
  describedBy,
  invalid = false,
  className,
  onChange,
  onBlur,
}: TaskNotesEditorProps) {
  // The editor owns its document after mount; the form only mirrors it.
  const [initialValue] = useState(value);

  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
    content: initialValue,
    contentType: "markdown",
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        "aria-placeholder": placeholder,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(invalid ? { "aria-invalid": "true" } : {}),
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.isEmpty ? "" : currentEditor.getMarkdown());
    },
    onBlur: () => onBlur?.(),
  });

  const isEmpty = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => currentEditor?.isEmpty ?? true,
  });

  if (!editor) {
    return (
      <div
        aria-busy="true"
        className={cn(SURFACE_CLASS_NAME, CONTENT_CLASS_NAME, className)}
      >
        <span className="sr-only">Menyiapkan editor catatan</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        SURFACE_CLASS_NAME,
        invalid && "border-destructive",
        className
      )}
    >
      <div className="border-b border-ink/8">
        <DailyNoteToolbar editor={editor} />
      </div>
      <div className={cn("relative flex flex-1 flex-col", CONTENT_CLASS_NAME)}>
        {isEmpty ? (
          <p
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-3 top-3 text-[15px] leading-[1.6] text-ink-muted"
          >
            {placeholder}
          </p>
        ) : null}
        <EditorContent
          editor={editor}
          className={cn("flex flex-1 flex-col", NOTES_TYPOGRAPHY)}
        />
      </div>
    </div>
  );
}
