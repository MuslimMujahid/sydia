import { useEffect, useImperativeHandle, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type JSONContent,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { AlertTriangle, Check, Link2, RotateCcw } from "lucide-react";
import { useBlocker } from "@tanstack/react-router";
import { DailyNoteToolbar } from "@/components/daily-notes/daily-note-toolbar";
import { NOTE_TYPOGRAPHY } from "@/components/daily-notes/daily-note-editor";
import { formatDailyNoteTitle } from "@/components/daily-notes/daily-note-date";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { TiptapDoc } from "@/lib/services/api/daily-notes/daily-notes.api";
import type {
  NoteEntry,
  WorkspaceNote,
} from "@/lib/services/api/notes/notes.api";
import { cn } from "@/lib/utils/cn";
import { NoteLink, NoteLinksContext, type LinkRequest } from "./note-link";
import { NoteLinkPicker } from "./note-link-picker";
import { useNoteAutosave } from "./use-note-autosave";
import { NoteBacklinks } from "./note-backlinks";
import { NoteVersionComparison } from "./note-version-comparison";

export type WorkspaceEditorHandle = {
  flush: () => Promise<boolean>;
  focusTitle: () => void;
  discard: () => void;
  draftText: () => string;
};
type WorkspaceEditorProps = {
  note: WorkspaceNote;
  entries: NoteEntry[];
  today: string;
  fresh: boolean;
  ref?: Ref<WorkspaceEditorHandle>;
  statusSlot: HTMLElement | null;
  onSaved: (note: WorkspaceNote) => void;
  onOpen: (ref: string) => void;
  onCreateLink: (title: string) => Promise<NoteEntry>;
  presentation?: "workspace" | "drawer";
  timezone?: string;
  guarded?: boolean;
  available?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
};

function asDocument(content: JSONContent): TiptapDoc {
  return JSON.parse(JSON.stringify(content)) as TiptapDoc;
}

function readableText(value: unknown): string {
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

export function WorkspaceEditor({
  note,
  entries,
  today,
  fresh,
  ref,
  statusSlot,
  onSaved,
  onOpen,
  onCreateLink,
  presentation = "workspace",
  timezone,
  guarded = false,
  available = true,
  onDirtyChange,
}: WorkspaceEditorProps) {
  const daily = note.ref.startsWith("daily:");
  const [title, setTitle] = useState(note.title);
  const [linkRequest, setLinkRequest] = useState<LinkRequest | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [comparisonDraft, setComparisonDraft] = useState(note.content);
  const [resolving, setResolving] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, defaultProtocol: "https" },
      }),
      NoteLink,
    ],
    content: note.content as JSONContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Isi catatan",
        "aria-multiline": "true",
        "data-placeholder": "Mulai dari hal yang ingin Anda ingat.",
      },
    },
    onUpdate: ({ editor: current }) => {
      autosave.change({ content: asDocument(current.getJSON()) });
      const selection = current.state.selection;
      if (!selection.empty) return;
      const before = selection.$from.parent.textBetween(
        0,
        selection.$from.parentOffset,
        "",
        "\ufffc"
      );

      const match = /\[\[([^[\]]*)$/.exec(before);
      if (match)
        setLinkRequest({
          label: match[1] ?? "",
          from: selection.from - match[0].length,
          to: selection.from,
        });
    },
  });

  const autosave = useNoteAutosave({
    note,
    available,
    onDirtyChange,
    onSaved,
    onRemote: (remote) => {
      setTitle(remote.title);
      editor?.commands.setContent(remote.content as JSONContent, {
        emitUpdate: false,
      });
    },
  });

  useEffect(() => {
    editor?.setEditable(available, false);
  }, [available, editor]);

  const empty = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? current.isEmpty : null),
  });

  function openComparison() {
    if (editor) setComparisonDraft(asDocument(editor.getJSON()));
    setCompareOpen(true);
  }

  useBlocker({
    shouldBlockFn: async () =>
      presentation === "workspace" && !(await autosave.flush()),
  });
  useImperativeHandle(
    ref,
    () => ({
      flush: autosave.flush,
      discard: autosave.discard,
      draftText: () =>
        `${autosave.draft.current.title}\n\n${readableText(autosave.draft.current.content)}`,
      focusTitle: () => document.getElementById("note-title")?.focus(),
    }),
    [autosave.flush, autosave.discard, autosave.draft]
  );
  useEffect(() => {
    if (fresh && !daily) document.getElementById("note-title")?.focus();
  }, [fresh, daily, editor]);

  async function resolve(choice: "server" | "draft") {
    setResolving(true);

    try {
      if (await autosave.resolve(choice)) setCompareOpen(false);
    } finally {
      setResolving(false);
    }
  }

  if (!editor)
    return (
      <div
        className="mx-auto w-full max-w-[728px] space-y-6 p-6"
        aria-busy="true"
        aria-label="Menyiapkan editor"
      >
        <div className="h-10 w-2/3 animate-pulse rounded bg-surface-1" />
        <div className="h-72 animate-pulse rounded bg-surface-1" />
      </div>
    );

  const saveNotices = (
    <>
      {autosave.status === "conflict" ? (
        <div role="alert" className="space-y-3 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" />
            {presentation === "drawer"
              ? "Catatan berubah di tempat lain"
              : "Penyimpanan otomatis dijeda"}
          </p>
          <p>Autosave dijeda. Draf Anda tetap tersedia.</p>
          <Button variant="dark-outline" size="sm" onClick={openComparison}>
            Bandingkan versi
          </Button>
        </div>
      ) : null}
      {autosave.error ? (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{autosave.error}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (autosave.status === "conflict") openComparison();
              else void autosave.flush();
            }}
          >
            <RotateCcw />
            Coba lagi
          </Button>
        </div>
      ) : null}
    </>
  );

  return (
    <NoteLinksContext value={{ entries, open: onOpen, choose: setLinkRequest }}>
      {statusSlot
        ? createPortal(
            <span
              className="inline-flex items-center gap-2 text-xs text-ink-muted"
              role="status"
              aria-live="polite"
            >
              {autosave.status === "saved" ? (
                <Check className="size-3.5" />
              ) : autosave.status === "error" ||
                autosave.status === "conflict" ? (
                <AlertTriangle className="size-3.5" />
              ) : null}
              {autosave.status === "saved"
                ? "Tersimpan"
                : autosave.status === "conflict"
                  ? "Dijeda"
                  : autosave.status === "error"
                    ? "Belum tersimpan"
                    : "Menyimpan…"}
            </span>,
            statusSlot
          )
        : null}
      {presentation === "drawer" && compareOpen ? (
        <NoteVersionComparison
          draftTitle={title}
          draftText={readableText(comparisonDraft)}
          savedTitle={autosave.conflict?.title}
          savedText={
            autosave.conflict
              ? readableText(autosave.conflict.content)
              : undefined
          }
          source={autosave.conflict?.sourceType}
          resolving={resolving}
          error={autosave.error}
          updatedAt={autosave.conflict?.updatedAt}
          timezone={timezone}
          onChoose={(choice) => {
            void resolve(choice);
          }}
          onBack={() => {
            setCompareOpen(false);
            requestAnimationFrame(() => editor.commands.focus());
          }}
        />
      ) : null}
      <div
        className={cn(
          "min-h-full flex-col",
          presentation === "drawer" && compareOpen ? "hidden" : "flex",
          presentation === "drawer" && "chat-note-editor"
        )}
      >
        <div
          className={cn(
            "mx-auto w-full max-w-[824px] flex-1 px-6 pt-8 pb-10 sm:px-12 sm:pt-11",
            presentation === "drawer" && "!pt-6 sm:!px-10 sm:!pt-8"
          )}
        >
          {daily ? (
            <h1 className="font-display text-[30px] leading-tight font-bold tracking-[-0.03em] sm:text-[34px]">
              {presentation === "drawer"
                ? new Intl.DateTimeFormat("id-ID", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(`${note.title}T12:00:00Z`))
                : formatDailyNoteTitle(note.title, today)}
            </h1>
          ) : (
            <>
              <h1 className="sr-only">{title}</h1>
              <textarea
                id="note-title"
                rows={1}
                aria-label="Judul catatan"
                value={title}
                readOnly={!available}
                className="w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent [field-sizing:content] font-display text-[30px] leading-tight font-bold tracking-[-0.03em] text-ink outline-none placeholder:text-ink-muted focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-brand/40 sm:text-[34px]"
                onChange={(event) => {
                  const nextTitle = event.target.value.replace(/[\r\n]/g, " ");
                  setTitle(nextTitle);
                  autosave.change({ title: nextTitle });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    editor.commands.focus();
                  }
                }}
                onFocus={(event) => {
                  if (fresh && event.target.value.startsWith("Untitled"))
                    event.target.select();
                }}
              />
            </>
          )}
          <p className="mt-3 text-xs text-ink-muted">
            {daily && presentation === "drawer"
              ? `${note.title.slice(0, 4)} · Catatan harian`
              : note.updatedAt
                ? `Diperbarui ${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(note.updatedAt))}`
                : "Satu catatan untuk hari ini"}
          </p>
          <div className="sticky top-0 z-10 mt-7 rounded-md bg-background [&_button]:min-h-11 [&_button]:min-w-11 sm:[&_button]:min-h-8 sm:[&_button]:min-w-8">
            <DailyNoteToolbar
              editor={editor}
              compact={presentation === "drawer"}
              status={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Tautkan catatan"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setLinkRequest({ label: "" })}
                >
                  <Link2 />
                </Button>
              }
            />
          </div>
          {presentation === "workspace" ? (
            <div className="mt-5">{saveNotices}</div>
          ) : null}
          <div className="group/editor relative mt-5">
            {(empty ?? editor.isEmpty) ? (
              <p
                aria-hidden="true"
                className="pointer-events-none absolute top-2 left-0 text-[17px] leading-[1.6] text-ink-muted group-focus-within/editor:hidden sm:top-3"
              >
                Mulai dari hal yang ingin Anda ingat.
              </p>
            ) : null}
            <EditorContent
              editor={editor}
              className={cn(
                NOTE_TYPOGRAPHY,
                "[&_.tiptap_a]:text-ink [&_.tiptap]:min-h-72 [&_.tiptap]:max-w-none [&_.tiptap]:px-0 [&_.tiptap]:py-2 sm:[&_.tiptap]:px-0 sm:[&_.tiptap]:py-3"
              )}
            />
          </div>
          <NoteBacklinks target={note.ref} onOpen={onOpen} />
        </div>
        {presentation === "drawer" &&
        !guarded &&
        !compareOpen &&
        (autosave.status === "conflict" || autosave.error) ? (
          <div className="sticky bottom-0 z-20 shrink-0 space-y-3 border-t border-ink/8 bg-background p-6">
            {saveNotices}
          </div>
        ) : null}
        <footer
          className={cn(
            "flex min-h-11 items-center gap-2 border-t border-ink/8 px-6 text-xs text-ink-muted",
            presentation === "drawer" && "hidden"
          )}
        >
          <span
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-2"
          >
            {autosave.status === "saved" ? (
              <Check className="size-3.5" />
            ) : null}
            {autosave.status === "conflict"
              ? "Penyimpanan dijeda · draf Anda dipertahankan"
              : autosave.status === "error"
                ? "Perubahan belum tersimpan"
                : autosave.status === "saved"
                  ? "Tersimpan otomatis"
                  : "Menyimpan…"}
          </span>
        </footer>
      </div>
      {linkRequest ? (
        <NoteLinkPicker
          editor={editor}
          request={linkRequest}
          entries={entries}
          onClose={() => setLinkRequest(null)}
          onCreate={onCreateLink}
        />
      ) : null}
      <Dialog
        open={presentation === "workspace" && compareOpen}
        onOpenChange={(open) => {
          if (!resolving) setCompareOpen(open);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-auto sm:max-w-3xl">
          <DialogTitle>Catatan berubah di tempat lain</DialogTitle>
          <p className="mt-3 text-sm text-ink-muted">
            Pilih versi yang ingin disimpan. Penyimpanan otomatis tetap dijeda
            selama Anda membandingkan.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <section className="min-w-0">
              <h3 className="font-semibold">Draf Anda</h3>
              <p className="mt-3 font-semibold">{title}</p>
              <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">
                {readableText(comparisonDraft)}
              </p>
            </section>
            <section className="min-w-0">
              <h3 className="font-semibold">Versi terbaru</h3>
              {autosave.conflict ? (
                <>
                  <p className="mt-3 font-semibold">
                    {autosave.conflict.title}
                  </p>
                  <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">
                    {readableText(autosave.conflict.content)}
                  </p>
                  <p className="mt-3 text-xs text-ink-muted">
                    Sumber: {autosave.conflict.sourceType}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm text-ink-muted">
                  Versi terbaru belum dimuat. Coba lagi.
                </p>
              )}
            </section>
          </div>
          {autosave.error ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {autosave.error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              variant="dark-outline"
              disabled={resolving}
              onClick={() => void resolve("server")}
            >
              Gunakan versi terbaru
            </Button>
            <Button disabled={resolving} onClick={() => void resolve("draft")}>
              {resolving ? "Menyimpan…" : "Simpan draf saya"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </NoteLinksContext>
  );
}
