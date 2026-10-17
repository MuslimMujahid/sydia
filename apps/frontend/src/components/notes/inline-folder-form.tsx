import { useEffect, useId, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight, Folder, LoaderCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { createWorkspaceItem } from "@/lib/services/api/notes/notes.api";
import { cn } from "@/lib/utils/cn";

type FolderDraft = {
  parentId: string | null;
  requestKey: string;
  title: string;
};

type FolderCreationOptions = { onCreated: () => Promise<void> };

// Both navigation surfaces share a draft and mutation. Retries after a lost
// response reuse the request key rather than creating a second folder.
export function useFolderCreation({ onCreated }: FolderCreationOptions) {
  const [draft, setDraft] = useState<FolderDraft | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const submitting = useRef(false);
  const cancelled = useRef(false);
  const restoreTriggerFocus = useRef(false);
  const mutation = useMutation({
    mutationFn: async (input: FolderDraft) => {
      await createWorkspaceItem({ ...input, kind: "folder" });
      await onCreated();
    },
    retry: false,
    onSuccess: () => setDraft(null),
    onError: (error) => {
      console.warn(
        "Creating the inline folder failed; the draft is retained.",
        error
      );
    },
    onSettled: () => {
      submitting.current = false;
    },
  });

  useEffect(() => {
    if (draft === null && restoreTriggerFocus.current) {
      restoreTriggerFocus.current = false;
      trigger.current?.focus();
    }
  }, [draft]);

  function cancel(restoreFocus = false) {
    if (submitting.current) return;
    cancelled.current = true;
    restoreTriggerFocus.current = restoreFocus;
    setDraft(null);
    mutation.reset();
  }

  function submit(source: "enter" | "blur") {
    if (!draft || cancelled.current || submitting.current) return;
    if (source === "blur" && mutation.isError) return;
    const title = draft.title.trim();

    if (!title) {
      cancel(source === "enter");

      return;
    }

    submitting.current = true;
    mutation.mutate({ ...draft, title });
  }

  return {
    draft,
    isPending: mutation.isPending,
    error: mutation.error,
    start(parentId: string | null, button: HTMLButtonElement) {
      if (submitting.current || draft) return;
      trigger.current = button;
      cancelled.current = false;
      mutation.reset();
      setDraft({
        parentId,
        requestKey: crypto.randomUUID(),
        title: "Folder baru",
      });
    },
    changeTitle(title: string) {
      if (submitting.current) return;
      setDraft((current) => current && { ...current, title });
      if (mutation.isError) mutation.reset();
    },
    submit,
    cancel,
  };
}

export type FolderCreation = ReturnType<typeof useFolderCreation>;

type InlineFolderFormProps = {
  draft: FolderDraft;
  parentLabel: string;
  creation: FolderCreation;
};

export function InlineFolderForm({
  draft,
  parentLabel,
  creation,
}: InlineFolderFormProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (input.current?.checkVisibility()) {
      input.current.focus();
      input.current.select();
      input.current.scrollIntoView({ block: "nearest" });
    }
  }, [draft.requestKey]);

  useEffect(() => {
    if (creation.error && input.current?.checkVisibility())
      input.current.focus();
  }, [creation.error]);

  return (
    <form
      aria-label="Folder baru"
      aria-busy={creation.isPending}
      className="py-0.5"
      onSubmit={(event) => {
        event.preventDefault();
        creation.submit("enter");
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          creation.submit("blur");
      }}
    >
      <p id={`${id}-help`} className="sr-only">
        Di {parentLabel}. Enter untuk membuat folder, Escape untuk membatalkan.
      </p>
      <div
        className={cn(
          "relative flex min-h-10 items-center rounded-[6px] border border-ink-muted bg-canvas sm:min-h-8",
          creation.error && "border-destructive"
        )}
      >
        <ChevronRight
          aria-hidden="true"
          className="pointer-events-none absolute left-1 size-3.5 text-ink-muted"
        />
        {creation.isPending ? (
          <LoaderCircle
            aria-hidden="true"
            className="pointer-events-none absolute left-6 size-4 animate-spin text-ink-muted motion-reduce:animate-none"
          />
        ) : (
          <Folder
            aria-hidden="true"
            className="pointer-events-none absolute left-6 size-4 text-ink-muted"
          />
        )}
        <Input
          ref={input}
          aria-label="Nama folder"
          aria-describedby={
            creation.error ? `${id}-help ${id}-error` : `${id}-help`
          }
          aria-invalid={Boolean(creation.error)}
          value={draft.title}
          readOnly={creation.isPending}
          enterKeyHint="done"
          autoComplete="off"
          className="h-[38px] min-w-0 rounded-[6px] border-0 bg-transparent py-1 pr-2 pl-12 text-base caret-ink selection:bg-brand/20 selection:text-ink focus-visible:ring-0 aria-invalid:ring-0 sm:h-[30px] sm:text-[13px]"
          onChange={(event) => creation.changeTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;

            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              creation.cancel(true);
            } else if (event.key === "Enter") {
              event.preventDefault();
              creation.submit("enter");
            }
          }}
        />
      </div>
      {creation.isPending ? (
        <span className="sr-only" role="status">
          Membuat folder…
        </span>
      ) : null}
      {creation.error ? (
        <p
          id={`${id}-error`}
          className="pt-1 pr-1 pl-12 text-xs text-destructive"
          role="alert"
        >
          {creation.error.message} Enter untuk mencoba lagi.
        </p>
      ) : null}
    </form>
  );
}
