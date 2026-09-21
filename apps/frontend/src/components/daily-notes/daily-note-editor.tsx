import { EditorContent, useEditorState, type Editor } from "@tiptap/react";
import { AlertCircle, Check, Cloud, LoaderCircle, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TiptapDoc } from "@/lib/services/api/daily-notes/daily-notes.api";
import { cn } from "@/lib/utils/cn";
import { DailyNoteToolbar } from "./daily-note-toolbar";
import {
  useDailyNoteEditor,
  type DailyNoteSaveStatus,
} from "./use-daily-note-editor";

type DailyNoteEditorProps = {
  date: string;
  initialContent?: TiptapDoc;
  noteExists: boolean;
};

type ReadyEditorProps = {
  editor: Editor;
  saveStatus: DailyNoteSaveStatus;
  onRetrySave: () => void;
};

const SAVE_STATUS_CONTENT: Record<
  Exclude<DailyNoteSaveStatus, "error">,
  { label: string; icon: typeof Cloud }
> = {
  idle: { label: "Belum ada perubahan", icon: Cloud },
  saving: { label: "Menyimpan…", icon: LoaderCircle },
  saved: { label: "Tersimpan", icon: Check },
};

function SaveStatus({
  status,
  onRetry,
}: {
  status: DailyNoteSaveStatus;
  onRetry: () => void;
}) {
  if (status === "error") {
    return (
      <div
        className="flex flex-wrap items-center justify-end gap-2 text-sm"
        role="alert"
      >
        <span className="inline-flex items-center gap-2 text-destructive">
          <AlertCircle className="size-4" />
          Gagal menyimpan
        </span>
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Coba lagi
        </Button>
      </div>
    );
  }

  const content = SAVE_STATUS_CONTENT[status];
  const Icon = content.icon;

  return (
    <span
      className="inline-flex items-center gap-2 text-sm text-ink-muted"
      role="status"
      aria-live="polite"
    >
      <Icon
        className={cn(
          "size-4",
          status === "saving" && "animate-spin motion-reduce:animate-none"
        )}
      />
      {content.label}
    </span>
  );
}

function ReadyEditor({ editor, saveStatus, onRetrySave }: ReadyEditorProps) {
  const isEmpty = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => currentEditor.isEmpty,
  });

  return (
    <section
      aria-label="Editor catatan harian"
      className="overflow-hidden rounded-lg border border-ink/6 bg-canvas shadow-card"
    >
      <DailyNoteToolbar editor={editor} />
      <div className="relative min-h-80 sm:min-h-96">
        {isEmpty ? (
          <div
            className="pointer-events-none absolute inset-x-6 top-8 max-w-xl sm:inset-x-8"
            aria-hidden="true"
          >
            <PenLine className="size-5 text-ink-muted" />
            <p className="mt-3 font-display text-[17px] font-semibold text-ink">
              Mulai dari hal yang ingin Anda ingat.
            </p>
            <p className="mt-1 text-[15px] leading-[1.6] text-ink-muted">
              Tulis bebas. Catatan baru disimpan setelah Anda mulai mengetik.
            </p>
          </div>
        ) : null}
        <EditorContent
          editor={editor}
          className="min-h-80 sm:min-h-96 [&_.tiptap]:min-h-80 sm:[&_.tiptap]:min-h-96 [&_.tiptap]:max-w-[68ch] [&_.tiptap]:px-6 [&_.tiptap]:py-8 [&_.tiptap]:text-[17px] [&_.tiptap]:leading-[1.6] [&_.tiptap]:text-ink [&_.tiptap]:outline-none sm:[&_.tiptap]:px-8 [&_.tiptap_a]:text-brand [&_.tiptap_a]:underline [&_.tiptap_a]:underline-offset-4 [&_.tiptap_h1]:mb-4 [&_.tiptap_h1]:font-display [&_.tiptap_h1]:text-[26px] [&_.tiptap_h1]:leading-[1.22] [&_.tiptap_h1]:font-semibold [&_.tiptap_h1]:tracking-[-0.018em] [&_.tiptap_h2]:mb-3 [&_.tiptap_h2]:font-display [&_.tiptap_h2]:text-[17px] [&_.tiptap_h2]:font-semibold [&_.tiptap_h3]:mb-2 [&_.tiptap_h3]:font-display [&_.tiptap_h3]:text-[15px] [&_.tiptap_h3]:font-semibold [&_.tiptap_li]:my-2 [&_.tiptap_ol]:my-5 [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6 [&_.tiptap_p]:mb-5 [&_.tiptap_ul]:my-5 [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6"
        />
      </div>
      <footer className="flex min-h-14 items-center justify-end border-t border-ink/8 px-4 py-2 sm:px-6">
        <SaveStatus status={saveStatus} onRetry={onRetrySave} />
      </footer>
    </section>
  );
}

export function DailyNoteEditor({
  date,
  initialContent,
  noteExists,
}: DailyNoteEditorProps) {
  const { editor, saveStatus, retrySave } = useDailyNoteEditor({
    date,
    initialContent,
    noteExists,
  });

  if (!editor) {
    return (
      <div
        className="min-h-80 animate-pulse rounded-lg border border-ink/6 bg-canvas shadow-card motion-reduce:animate-none sm:min-h-96"
        aria-busy="true"
        aria-label="Menyiapkan editor catatan"
      >
        <div className="h-14 border-b border-ink/8 bg-surface-1" />
        <div className="space-y-4 p-8">
          <div className="h-5 w-2/3 rounded-sm bg-surface-1" />
          <div className="h-5 w-4/5 rounded-sm bg-surface-1" />
          <div className="h-5 w-1/2 rounded-sm bg-surface-1" />
        </div>
      </div>
    );
  }

  return (
    <ReadyEditor
      editor={editor}
      saveStatus={saveStatus}
      onRetrySave={retrySave}
    />
  );
}
