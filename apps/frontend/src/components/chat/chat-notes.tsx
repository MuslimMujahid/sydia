import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  FileText,
  X,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { dayKeyInZone } from "@/components/calendar/month-anchor";
import {
  WorkspaceEditor,
  type WorkspaceEditorHandle,
} from "@/components/notes/workspace-editor";
import { Button } from "@/components/ui/button";
import {
  createWorkspaceItem,
  notesKeys,
  workspaceNoteQueryOptions,
  workspaceQueryOptions,
  type NoteEntry,
  type WorkspaceNote,
} from "@/lib/services/api/notes/notes.api";
import { dailyNoteQueryKeys } from "@/lib/services/api/daily-notes/daily-notes.queries";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";
import { noteReferenceSchema } from "./note-entities";

type ChatNotesContextValue = {
  open: (ref: string, trigger?: HTMLElement) => void;
  activeNote: WorkspaceNote | undefined;
  selectedRef: string | undefined;
  flush: () => Promise<boolean>;
  locale: SupportedLocale;
};
const ChatNotesContext = createContext<ChatNotesContextValue | null>(null);
export const useChatNotes = () => useContext(ChatNotesContext);

interface ChatNotesProviderProps {
  children: ReactNode;
  locale: SupportedLocale;
  timezone: string;
  conversationId?: string;
}

export function ChatNotesProvider({
  children,
  locale,
  timezone,
  conversationId,
}: ChatNotesProviderProps) {
  const en = locale === "en";
  const client = useQueryClient();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string>();
  const [statusSlot, setStatusSlot] = useState<HTMLDivElement | null>(null);
  const [pending, setPending] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [compact, setCompact] = useState(false);
  const previousConversation = useRef(conversationId);
  const [creationError, setCreationError] = useState<string>();
  const [recoveryNotice, setRecoveryNotice] = useState<string>();
  const editor = useRef<WorkspaceEditorHandle>(null);
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const guardPromise = useRef<Promise<boolean> | null>(null);
  const guardResolve = useRef<((value: boolean) => void) | null>(null);
  const linkCreation = useRef<{ title: string; requestKey: string } | null>(
    null
  );

  const [layout, setLayout] = useState<HTMLDivElement | null>(null);
  const note = useQuery({
    ...workspaceNoteQueryOptions(selected ?? ""),
    enabled: Boolean(selected),
    staleTime: 0,
  });

  const workspace = useQuery({
    ...workspaceQueryOptions(),
    enabled: Boolean(selected),
  });

  const entries = workspace.data?.notes ?? [];
  const activeNote = selected && note.isSuccess ? note.data : undefined;
  const retainedDraft = note.isError && hasDraft;

  async function flush(): Promise<boolean> {
    if (guardPromise.current) return guardPromise.current;

    const work = async () => {
      if (!editor.current || (await editor.current.flush())) return true;
      setPending(true);

      return new Promise<boolean>((resolve) => {
        guardResolve.current = resolve;
      });
    };

    guardPromise.current = work();

    try {
      return await guardPromise.current;
    } finally {
      guardPromise.current = null;
    }
  }

  function finishGuard(value: boolean) {
    setPending(false);
    guardResolve.current?.(value);
    guardResolve.current = null;
  }

  useBlocker({ shouldBlockFn: async () => !(await flush()) });

  async function open(ref: string, source?: HTMLElement) {
    if (!noteReferenceSchema.safeParse(ref).success) {
      console.warn("Rejected invalid chat note reference", { ref });

      return;
    }

    if (ref === selected) {
      panel.current?.focus();

      return;
    }

    if (!(await flush())) return;
    trigger.current = source ?? trigger.current;
    setCreationError(undefined);
    setSelected(ref);
  }

  async function close() {
    if (!(await flush())) return;
    setSelected(undefined);
    trigger.current?.focus();
  }

  useEffect(() => {
    if (selected) panel.current?.focus();
  }, [selected]);
  useEffect(() => {
    if (previousConversation.current !== conversationId) {
      // Route transitions already passed the save guard. Keep the chat's stream
      // component mounted while dropping note context for the new conversation.
      previousConversation.current = conversationId;
      setSelected(undefined);
      trigger.current = null;
    }
  }, [conversationId]);
  useEffect(() => {
    const element = layout;
    if (!element) return;
    const measure = () => setCompact(element.clientWidth < 960);
    const observer = new ResizeObserver(measure);

    measure();
    observer.observe(element);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [layout]);

  function saved(value: WorkspaceNote) {
    client.setQueryData(notesKeys.detail(value.ref), value);
    void client.invalidateQueries({ queryKey: notesKeys.workspace });
    void client.invalidateQueries({ queryKey: dailyNoteQueryKeys.all });
    void client.invalidateQueries({ queryKey: ["notes", "backlinks"] });
  }

  async function createLink(title: string): Promise<NoteEntry> {
    if (!activeNote) throw new Error("No active note");
    if (linkCreation.current?.title !== title)
      linkCreation.current = { title, requestKey: crypto.randomUUID() };

    try {
      const item = await createWorkspaceItem({
        kind: "note",
        title,
        parentId: activeNote.parentId,
        requestKey: linkCreation.current.requestKey,
      });

      const entry: NoteEntry = {
        ref: `custom:${item.id}`,
        id: item.id,
        kind: "note",
        title: item.title,
        path: item.path,
        parentId: item.parentId,
        excerpt: "",
        updatedAt: item.updatedAt,
      };

      await client.invalidateQueries({ queryKey: notesKeys.workspace });
      linkCreation.current = null;
      setCreationError(undefined);

      return entry;
    } catch (error) {
      console.warn("Chat note link creation failed", { error });
      setCreationError(
        en
          ? "The linked note could not be created. Try again."
          : "Catatan tertaut belum dapat dibuat. Coba lagi."
      );
      throw error;
    }
  }

  const path = entries.find((entry) => entry.ref === selected)?.path;
  const folderPath = path?.split(" / ").slice(0, -1).join(" / ");

  return (
    <ChatNotesContext
      value={{
        open: (ref, source) => {
          void open(ref, source);
        },
        activeNote,
        selectedRef: selected,
        flush,
        locale,
      }}
    >
      <div
        ref={setLayout}
        className="chat-notes-layout flex h-full min-h-0 min-w-0"
        data-note-open={Boolean(selected)}
      >
        <div
          inert={compact && Boolean(selected)}
          className="chat-notes-conversation flex min-h-0 min-w-0 flex-1 flex-col"
        >
          {children}
        </div>
        {selected ? (
          <aside
            ref={panel}
            tabIndex={-1}
            aria-label={en ? "Note editor" : "Editor catatan"}
            role={compact ? "dialog" : "complementary"}
            aria-modal={compact ? true : undefined}
            className="chat-note-panel flex min-h-0 flex-col border-l border-ink/8 bg-canvas outline-none"
            onKeyDown={(event) => {
              if (
                event.key === "Escape" &&
                !event.defaultPrevented &&
                !document.querySelector(
                  '[data-slot="dialog-content"], [role="menu"], [role="listbox"]'
                )
              ) {
                event.preventDefault();
                void close();
              }

              if (compact && event.key === "Tab") {
                const controls = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    'button:not(:disabled), a[href], textarea, input, [contenteditable="true"], [tabindex="0"]'
                  )
                ).filter((element) => element.getClientRects().length > 0);

                const first = controls[0],
                  last = controls.at(-1);

                if (
                  event.shiftKey &&
                  (document.activeElement === first ||
                    document.activeElement === panel.current)
                ) {
                  event.preventDefault();
                  last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <header className="chat-note-header flex shrink-0 items-center gap-2 border-b border-ink/8 px-4">
              <button
                type="button"
                className="chat-note-back inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
                onClick={() => void close()}
              >
                <ArrowLeft className="size-4" />
                Chat
              </button>
              <div className="chat-note-path min-w-0 flex-1 truncate rounded-full bg-ink/5 px-3 py-2 text-xs text-ink-muted">
                {folderPath ? `${folderPath} / ` : ""}
                <span className="font-semibold text-ink">
                  {selected.startsWith("daily:")
                    ? en
                      ? "Daily note"
                      : "Catatan harian"
                    : en
                      ? "Custom note"
                      : "Catatan khusus"}
                </span>
              </div>
              <div
                ref={setStatusSlot}
                className="chat-note-status ml-auto flex h-8 shrink-0 items-center rounded-full bg-ink/5 px-3"
              />
              <button
                type="button"
                aria-label={en ? "Open in Notes" : "Buka di Catatan"}
                className="chat-note-workspace inline-flex h-8 shrink-0 items-center gap-2 rounded-full bg-ink/5 px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-brand"
                onClick={async () => {
                  if (await flush())
                    await navigate({
                      to: "/notes",
                      search: selected.startsWith("daily:")
                        ? { date: selected.slice(6) }
                        : { note: selected.slice(7) },
                    });
                }}
              >
                <ExternalLink className="size-3.5" />
                <span>{en ? "Open in Notes" : "Buka di Catatan"}</span>
              </button>
              <button
                type="button"
                aria-label={en ? "Close note" : "Tutup catatan"}
                className="chat-note-close grid size-7 shrink-0 place-items-center rounded-full bg-ink/5 text-ink-muted focus-visible:outline-2 focus-visible:outline-brand"
                onClick={() => void close()}
              >
                <X className="size-3.5" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {note.isPending ? (
                <div
                  aria-busy="true"
                  aria-label={en ? "Loading note" : "Memuat catatan"}
                  className="space-y-6 p-10"
                >
                  <div className="h-10 w-2/3 animate-pulse rounded bg-surface-1" />
                  <div className="h-56 animate-pulse rounded bg-surface-1" />
                </div>
              ) : null}
              {note.isError ? (
                <div role="alert" className="space-y-4 px-6 pt-12 pb-6">
                  <FileText className="size-7 text-ink-muted" />
                  <h2 className="pt-3 text-[28px] font-bold tracking-[-0.03em]">
                    {en ? "Note unavailable" : "Catatan tidak tersedia"}
                  </h2>
                  <p className="text-sm text-ink-muted">{note.error.message}</p>
                  <Button
                    variant="dark-outline"
                    onClick={async () => {
                      if (await flush()) await navigate({ to: "/notes" });
                    }}
                  >
                    <ExternalLink className="size-4" />
                    {en ? "Open Notes" : "Buka Catatan"}
                  </Button>
                  <Button
                    variant="dark-outline"
                    size="sm"
                    onClick={() => void note.refetch()}
                  >
                    {en ? "Try again" : "Coba lagi"}
                  </Button>
                  {retainedDraft ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          if (!editor.current)
                            throw new Error("Note editor is not ready");
                          await navigator.clipboard.writeText(
                            editor.current.draftText()
                          );
                          setRecoveryNotice(
                            en ? "Draft copied." : "Draf disalin."
                          );
                        } catch (error) {
                          console.warn("Note draft copy failed", {
                            name:
                              error instanceof Error
                                ? error.name
                                : "UnknownError",
                          });
                          setRecoveryNotice(
                            en
                              ? "Select and copy your draft below."
                              : "Pilih dan salin teks draf Anda di bawah."
                          );
                        }
                      }}
                    >
                      {en ? "Copy draft" : "Salin draf"}
                    </Button>
                  ) : null}
                  {recoveryNotice ? (
                    <p role="status" className="text-sm text-ink-muted">
                      {recoveryNotice}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {workspace.isError ? (
                <p role="alert" className="px-6 pt-4 text-sm text-destructive">
                  {en
                    ? "Note links could not be loaded."
                    : "Tautan catatan belum dapat dimuat."}{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => void workspace.refetch()}
                  >
                    {en ? "Retry" : "Coba lagi"}
                  </button>
                </p>
              ) : null}
              {creationError ? (
                <p role="alert" className="px-6 pt-4 text-sm text-destructive">
                  {creationError}
                </p>
              ) : null}
              {note.data && (!note.isError || retainedDraft) ? (
                <WorkspaceEditor
                  key={selected}
                  ref={editor}
                  note={note.data}
                  entries={entries}
                  today={dayKeyInZone(new Date(), timezone)}
                  fresh={false}
                  presentation="drawer"
                  guarded={pending}
                  available={!note.isError}
                  onDirtyChange={setHasDraft}
                  timezone={timezone}
                  statusSlot={note.isError ? null : statusSlot}
                  onSaved={saved}
                  onOpen={(ref) => {
                    void open(ref);
                  }}
                  onCreateLink={createLink}
                />
              ) : null}
            </div>
            {pending ? (
              <div
                role="alert"
                className="shrink-0 space-y-4 border-t border-ink/8 bg-background p-6 text-sm"
              >
                <p className="flex items-center gap-3 text-base font-semibold">
                  <AlertTriangle className="size-4 text-destructive" />
                  {en ? "Save before continuing" : "Simpan sebelum melanjutkan"}
                </p>
                <p className="text-ink-muted">
                  {en
                    ? "Changes are unsaved. Your draft stays open."
                    : "Perubahan belum tersimpan. Draf Anda tetap terbuka."}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center [&>button]:rounded-[10px] [&>button]:h-10">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shadow-none"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);

                      try {
                        if (editor.current && (await editor.current.flush()))
                          finishGuard(true);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {en ? "Retry" : "Coba lagi"}
                  </Button>
                  <Button
                    size="sm"
                    variant="dark-outline"
                    disabled={busy}
                    onClick={() => {
                      editor.current?.discard();
                      finishGuard(true);
                    }}
                  >
                    {en ? "Discard changes" : "Buang perubahan"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="col-span-2 sm:ml-auto"
                    onClick={() => finishGuard(false)}
                  >
                    {en ? "Keep editing" : "Lanjut mengedit"}
                  </Button>
                </div>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </ChatNotesContext>
  );
}

export function ChatNoteContextIndicator() {
  const context = useChatNotes();
  if (!context?.activeNote) return null;
  const label = context.activeNote.ref.startsWith("daily:")
    ? new Intl.DateTimeFormat(context.locale === "en" ? "en-US" : "id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${context.activeNote.ref.slice(6)}T12:00:00Z`))
    : context.activeNote.title;

  return (
    <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-6 pt-2 pb-1 text-xs font-medium text-ink-muted">
      <FileText className="size-3.5 shrink-0" />
      <span className="truncate">
        {context.locale === "en" ? "Editing" : "Sedang diedit"}: {label}
      </span>
    </div>
  );
}
