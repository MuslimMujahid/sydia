import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useUploadDocument } from "@/lib/services/api/documents/documents.queries";

export type UploadResult = {
  name: string;
  state: "pending" | "uploading" | "completed" | "failed";
  error?: string;
  file: File;
  folderId?: string;
};

type FileUploadContextValue = {
  results: UploadResult[];
  pending: boolean;
  destination: string;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  start: (
    files: File[],
    folderId: string | undefined,
    destination: string
  ) => void;
  retry: () => void;
  dismiss: () => void;
};

const FileUploadContext = createContext<FileUploadContextValue | null>(null);

/**
 * Owns file uploads for the whole app shell, so an upload keeps running and
 * stays visible while the user moves between pages.
 */
export function FileUploadProvider({ children }: { children: ReactNode }) {
  const upload = useUploadDocument();
  const [results, setResults] = useState<UploadResult[]>([]);
  const [pending, setPending] = useState(false);
  const [destination, setDestination] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  // Leaving the app would abort the request in flight.
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  const updateUpload = (index: number, patch: Partial<UploadResult>) =>
    setResults((previous) =>
      previous.map((item, position) =>
        position === index ? { ...item, ...patch } : item
      )
    );

  async function runUploads(next: UploadResult[]) {
    setResults(next);
    setPending(true);

    try {
      for (const [index, result] of next.entries()) {
        if (result.state === "completed") continue;
        updateUpload(index, { state: "uploading", error: undefined });

        try {
          await upload.mutateAsync({
            file: result.file,
            folderId: result.folderId,
          });
          updateUpload(index, { state: "completed" });
        } catch (error: unknown) {
          console.error(
            "File upload failed; remaining files will still be attempted.",
            error
          );
          updateUpload(index, {
            state: "failed",
            error:
              error instanceof Error
                ? error.message
                : "Unggahan gagal. Coba lagi.",
          });
        }
      }
    } finally {
      setPending(false);
    }
  }

  function start(
    files: File[],
    folderId: string | undefined,
    nextDestination: string
  ) {
    if (!files.length || pending) return;
    setDestination(nextDestination);
    setCollapsed(false);
    void runUploads(
      files.map((file) => ({
        file,
        name: file.name,
        state: "pending",
        folderId,
      }))
    );
  }

  return (
    <FileUploadContext.Provider
      value={{
        results,
        pending,
        destination,
        collapsed,
        setCollapsed,
        start,
        retry: () => void runUploads(results),
        dismiss: () => setResults([]),
      }}
    >
      {children}
    </FileUploadContext.Provider>
  );
}

export function useFileLibraryUpload() {
  const value = useContext(FileUploadContext);
  if (!value)
    throw new Error(
      "useFileLibraryUpload must be used inside FileUploadProvider."
    );

  return value;
}
