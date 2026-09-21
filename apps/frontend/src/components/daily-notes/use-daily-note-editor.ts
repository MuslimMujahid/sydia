import { useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUpsertDailyNote } from "@/lib/services/api/daily-notes/daily-notes.queries";
import type {
  TiptapDoc,
  TiptapNode,
} from "@/lib/services/api/daily-notes/daily-notes.api";

export type DailyNoteSaveStatus = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 800;
const EMPTY_DOCUMENT: TiptapDoc = { type: "doc", content: [] };
const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
    },
  }),
];

function asTiptapNodes(content: JSONContent[]): TiptapNode[] {
  return content.map((node) => {
    const serialized = JSON.stringify(node);

    return JSON.parse(serialized) as TiptapNode;
  });
}

function asTiptapDoc(content: JSONContent): TiptapDoc {
  return {
    type: "doc",
    ...(content.content ? { content: asTiptapNodes(content.content) } : {}),
  };
}

type UseDailyNoteEditorOptions = {
  date: string;
  initialContent?: TiptapDoc;
  noteExists: boolean;
};

export function useDailyNoteEditor({
  date,
  initialContent,
  noteExists,
}: UseDailyNoteEditorOptions) {
  const { mutateAsync: saveDailyNote } = useUpsertDailyNote();
  const [saveStatus, setSaveStatus] = useState<DailyNoteSaveStatus>(
    noteExists ? "saved" : "idle"
  );

  const mountedRef = useRef(true);
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<TiptapDoc | null>(null);
  const latestContentRef = useRef<TiptapDoc>(initialContent ?? EMPTY_DOCUMENT);

  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const writeVersionRef = useRef(0);
  const hasWriteStartedRef = useRef(false);
  const noteExistsRef = useRef(noteExists);

  const enqueueSave = useCallback(
    (content: TiptapDoc) => {
      const version = writeVersionRef.current + 1;

      writeVersionRef.current = version;
      hasWriteStartedRef.current = true;
      if (mountedRef.current) setSaveStatus("saving");

      writeChainRef.current = writeChainRef.current
        .catch(() => undefined)
        .then(async () => {
          await saveDailyNote({ date, content });
          noteExistsRef.current = true;

          if (
            mountedRef.current &&
            version === writeVersionRef.current &&
            pendingRef.current === null
          ) {
            setSaveStatus("saved");
          }
        })
        .catch(() => {
          if (mountedRef.current && version === writeVersionRef.current)
            setSaveStatus("error");
        });
    },
    [date, saveDailyNote]
  );

  const flushPendingSave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const pending = pendingRef.current;

    pendingRef.current = null;
    if (pending) enqueueSave(pending);
  }, [enqueueSave]);

  const queueSave = useCallback(
    (content: TiptapDoc, isEmpty: boolean) => {
      latestContentRef.current = content;

      if (isEmpty && !noteExistsRef.current && !hasWriteStartedRef.current) {
        clearTimeout(timerRef.current ?? undefined);
        timerRef.current = null;

        if (mountedRef.current) setSaveStatus("idle");

        return;
      }

      pendingRef.current = content;
      clearTimeout(timerRef.current ?? undefined);

      if (mountedRef.current) setSaveStatus("saving");
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) enqueueSave(pending);
      }, AUTOSAVE_DELAY_MS);
    },
    [enqueueSave]
  );

  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
    content: JSON.parse(
      JSON.stringify(initialContent ?? EMPTY_DOCUMENT)
    ) as JSONContent,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        "aria-label": `Catatan untuk ${date}`,
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      queueSave(asTiptapDoc(currentEditor.getJSON()), currentEditor.isEmpty);
    },
  });

  const retrySave = useCallback(() => {
    enqueueSave(latestContentRef.current);
  }, [enqueueSave]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      flushPendingSave();
    };
  }, [flushPendingSave]);

  return {
    editor,
    saveStatus,
    retrySave,
  };
}
