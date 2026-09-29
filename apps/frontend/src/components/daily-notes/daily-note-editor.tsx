import { EditorContent, useEditorState, type Editor } from "@tiptap/react";
import { AlertCircle, Check, LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TiptapDoc } from "@/lib/services/api/daily-notes/daily-notes.api";
import { cn } from "@/lib/utils/cn";
import { DailyNoteToolbar } from "./daily-note-toolbar";
import {
  useDailyNoteEditor,
  type DailyNoteSaveStatus,
} from "./use-daily-note-editor";

const PLACEHOLDER = "Mulai dari hal yang ingin Anda ingat.";

// Shared by the editor and its skeleton so swapping them never shifts the page.
// Phones get an edge-to-edge sheet; wider screens get a card.
const SURFACE_CLASS_NAME =
  "flex flex-col border-t border-ink/6 bg-canvas sm:rounded-lg sm:border sm:shadow-card";

const CONTENT_CLASS_NAME = "min-h-64 sm:min-h-[26rem]";

const NOTE_TYPOGRAPHY = cn(
  "[&_.tiptap]:max-w-[68ch] [&_.tiptap]:flex-1 [&_.tiptap]:px-5 [&_.tiptap]:py-6 [&_.tiptap]:text-[17px] [&_.tiptap]:leading-[1.6] [&_.tiptap]:text-ink [&_.tiptap]:outline-none sm:[&_.tiptap]:px-8 sm:[&_.tiptap]:py-8",
  // Blocks sit close together; a heading opens a new section.
  "[&_.tiptap>*+*]:mt-3 [&_.tiptap>h1:not(:first-child)]:mt-8 [&_.tiptap>h2:not(:first-child)]:mt-7 [&_.tiptap>h3:not(:first-child)]:mt-6",
  "[&_.tiptap_h1]:font-display [&_.tiptap_h1]:text-[26px] [&_.tiptap_h1]:leading-[1.22] [&_.tiptap_h1]:font-semibold [&_.tiptap_h1]:tracking-[-0.018em]",
  "[&_.tiptap_h2]:font-display [&_.tiptap_h2]:text-xl [&_.tiptap_h2]:leading-[1.3] [&_.tiptap_h2]:font-semibold [&_.tiptap_h2]:tracking-[-0.01em]",
  "[&_.tiptap_h3]:font-display [&_.tiptap_h3]:font-semibold",
  "[&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6 [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6 [&_.tiptap_li]:pl-1 [&_.tiptap_li::marker]:text-ink-muted [&_.tiptap_li+li]:mt-1 [&_.tiptap_li>ol]:mt-1 [&_.tiptap_li>ul]:mt-1",
  "[&_.tiptap_a]:text-link [&_.tiptap_a]:underline [&_.tiptap_a]:decoration-link/40 [&_.tiptap_a]:underline-offset-4",
  "[&_.tiptap_blockquote]:border-l-[3px] [&_.tiptap_blockquote]:border-brand/60 [&_.tiptap_blockquote]:pl-5 [&_.tiptap_blockquote]:text-ink-muted [&_.tiptap_blockquote>*+*]:mt-2",
  "[&_.tiptap_code]:rounded-sm [&_.tiptap_code]:bg-surface-1 [&_.tiptap_code]:px-1 [&_.tiptap_code]:py-0.5 [&_.tiptap_code]:font-mono [&_.tiptap_code]:text-[0.85em]",
  "[&_.tiptap_pre]:overflow-x-auto [&_.tiptap_pre]:rounded-md [&_.tiptap_pre]:bg-editorial [&_.tiptap_pre]:p-4 [&_.tiptap_pre]:font-mono [&_.tiptap_pre]:text-sm [&_.tiptap_pre]:text-canvas [&_.tiptap_pre_code]:bg-transparent [&_.tiptap_pre_code]:p-0 [&_.tiptap_pre_code]:text-[1em] [&_.tiptap_pre_code]:text-inherit",
  "[&_.tiptap_hr]:border-hairline"
);

type DailyNoteEditorProps = {
  date: string;
  /** Accessible name of the writing surface. */
  label: string;
  initialContent?: TiptapDoc;
  noteExists: boolean;
  className?: string;
};

type ReadyEditorProps = {
  editor: Editor;
  saveStatus: DailyNoteSaveStatus;
  onRetrySave: () => void;
  className?: string;
};

type DailyNoteEditorSkeletonProps = {
  label?: string;
  className?: string;
};

const SAVE_STATUS_CONTENT = {
  saving: { label: "Menyimpan…", icon: LoaderCircle },
  saved: { label: "Tersimpan", icon: Check },
} as const;

/** Quiet autosave indicator; phones show only the icon to keep one toolbar row. */
function SaveStatus({ status }: { status: DailyNoteSaveStatus }) {
  const content =
    status === "saving" || status === "saved"
      ? SAVE_STATUS_CONTENT[status]
      : null;

  const Icon = content?.icon;

  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-1.5 pr-1 text-[13px] text-ink-muted"
    >
      {content && Icon ? (
        <>
          <Icon
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0",
              status === "saving" && "animate-spin motion-reduce:animate-none"
            )}
          />
          <span className="max-sm:sr-only">{content.label}</span>
        </>
      ) : null}
    </span>
  );
}

function SaveErrorNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-x-3 border-t border-destructive/20 bg-destructive/5 py-1 pr-2 pl-4 text-sm text-destructive sm:pl-5"
    >
      <span className="inline-flex items-center gap-2">
        <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
        Perubahan belum tersimpan.
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="px-3 text-destructive hover:text-destructive"
        onClick={onRetry}
      >
        <RotateCcw className="max-sm:hidden" />
        Coba lagi
      </Button>
    </div>
  );
}

function ReadyEditor({
  editor,
  saveStatus,
  onRetrySave,
  className,
}: ReadyEditorProps) {
  const isEmpty = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => currentEditor.isEmpty,
  });

  return (
    <section
      aria-label="Editor catatan harian"
      className={cn(SURFACE_CLASS_NAME, "sm:overflow-clip", className)}
    >
      {/* Stays under the app header while scrolling a long note. */}
      <div className="sticky top-16 z-20 border-b border-ink/8 bg-canvas lg:top-0">
        <DailyNoteToolbar
          editor={editor}
          status={<SaveStatus status={saveStatus} />}
        />
        {saveStatus === "error" ? (
          <SaveErrorNotice
            onRetry={() => {
              onRetrySave();
              // The notice disappears once the retry starts; keep writing.
              editor.commands.focus();
            }}
          />
        ) : null}
      </div>
      <div className={cn("relative flex flex-1 flex-col", CONTENT_CLASS_NAME)}>
        {isEmpty ? (
          <p
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-5 top-6 text-[17px] leading-[1.6] text-ink-muted sm:inset-x-8 sm:top-8"
          >
            {PLACEHOLDER}
          </p>
        ) : null}
        <EditorContent
          editor={editor}
          className={cn("flex flex-1 flex-col", NOTE_TYPOGRAPHY)}
        />
      </div>
    </section>
  );
}

export function DailyNoteEditorSkeleton({
  label = "Menyiapkan editor catatan",
  className,
}: DailyNoteEditorSkeletonProps) {
  return (
    <div aria-busy="true" className={cn(SURFACE_CLASS_NAME, className)}>
      <span className="sr-only">{label}</span>
      <div className="h-14 border-b border-ink/8" />
      <div
        className={cn(
          "space-y-4 px-5 py-6 sm:px-8 sm:py-8",
          CONTENT_CLASS_NAME
        )}
      >
        {["w-2/3", "w-4/5", "w-1/2"].map((width) => (
          <div
            key={width}
            className={cn(
              "h-5 animate-pulse rounded-sm bg-surface-1 motion-reduce:animate-none",
              width
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function DailyNoteEditor({
  date,
  label,
  initialContent,
  noteExists,
  className,
}: DailyNoteEditorProps) {
  const { editor, saveStatus, retrySave } = useDailyNoteEditor({
    date,
    label,
    placeholder: PLACEHOLDER,
    initialContent,
    noteExists,
  });

  if (!editor) return <DailyNoteEditorSkeleton className={className} />;

  return (
    <ReadyEditor
      editor={editor}
      saveStatus={saveStatus}
      onRetrySave={retrySave}
      className={className}
    />
  );
}
