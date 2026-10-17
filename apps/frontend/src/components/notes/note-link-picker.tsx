import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { NoteEntry } from "@/lib/services/api/notes/notes.api";
import type { LinkRequest } from "./note-link";

type NoteLinkPickerProps = {
  editor: Editor;
  request: LinkRequest;
  entries: NoteEntry[];
  onClose: () => void;
  onCreate: (title: string) => Promise<NoteEntry>;
};

export function NoteLinkPicker({
  editor,
  request,
  entries,
  onClose,
  onCreate,
}: NoteLinkPickerProps) {
  const [query, setQuery] = useState(request.label);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const matches = entries
    .filter((entry) =>
      `${entry.title} ${entry.path}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase())
    )
    .slice(0, 30);

  function select(entry: NoteEntry) {
    const chain = editor.chain().focus();
    if (request.position !== undefined)
      chain.setNodeSelection(request.position).deleteSelection();
    else if (request.from !== undefined && request.to !== undefined)
      chain.deleteRange({ from: request.from, to: request.to });
    chain
      .insertContent({
        type: "noteLink",
        attrs: { target: entry.ref, label: entry.title },
      })
      .run();
    onClose();
  }

  function cancel() {
    if (
      request.from !== undefined &&
      request.to !== undefined &&
      query.trim()
    ) {
      editor
        .chain()
        .focus()
        .deleteRange({ from: request.from, to: request.to })
        .insertContent({
          type: "noteLink",
          attrs: { target: null, label: query.trim() },
        })
        .run();
    }

    onClose();
  }

  async function create() {
    setCreating(true);
    setError(null);

    try {
      select(await onCreate(query.trim()));
    } catch (failure) {
      console.warn("Creating a linked note failed.", failure);
      setError(
        failure instanceof Error
          ? failure.message
          : "Catatan belum dapat dibuat. Coba lagi."
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !creating) cancel();
      }}
    >
      <DialogContent
        variant="sheet"
        className="max-h-[85dvh] overflow-auto sm:max-w-xl"
      >
        <DialogTitle>Tautkan catatan</DialogTitle>
        <Input
          autoFocus
          aria-label="Cari judul atau lokasi catatan"
          placeholder="Cari judul atau lokasi…"
          value={query}
          onChange={(event) =>
            setQuery(event.target.value.replace(/\]\]$/, ""))
          }
          className="mt-5"
        />
        <ul className="mt-3 max-h-72 overflow-auto">
          {matches.map((entry) => (
            <li key={entry.ref}>
              <button
                className="flex min-h-14 w-full items-center gap-3 rounded-sm px-3 py-2 text-left hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-brand"
                onClick={() => select(entry)}
              >
                <FileText className="size-4 shrink-0 text-ink-muted" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {entry.title}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    {entry.path}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {matches.length === 0 ? (
          <p className="py-4 text-sm text-ink-muted">
            Belum ada catatan yang cocok.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          variant="dark-outline"
          className="mt-3 w-full justify-start"
          disabled={!query.trim() || creating}
          onClick={() => void create()}
        >
          <Plus />
          {creating ? "Membuat…" : `Buat catatan “${query.trim() || "…"}”`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
