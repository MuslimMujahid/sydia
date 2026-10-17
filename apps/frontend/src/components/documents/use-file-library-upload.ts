import { useState } from "react";
import { useUploadDocument } from "@/lib/services/api/documents/documents.queries";

export type UploadResult = {
  name: string;
  state: "pending" | "uploading" | "completed" | "failed";
  error?: string;
  file: File;
  folderId?: string;
};

export function useFileLibraryUpload() {
  const upload = useUploadDocument();
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadDestination, setUploadDestination] = useState("");

  const updateUpload = (index: number, patch: Partial<UploadResult>) =>
    setUploadResults((previous) =>
      previous.map((item, position) =>
        position === index ? { ...item, ...patch } : item
      )
    );

  async function runUploads(results: UploadResult[]) {
    setUploadResults(results);
    setUploading(true);

    try {
      for (const [index, result] of results.entries()) {
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
      setUploading(false);
    }
  }

  function start(
    files: File[],
    folderId: string | undefined,
    destination: string
  ) {
    if (!files.length) return;
    setUploadDestination(destination);
    void runUploads(
      files.map((file) => ({
        file,
        name: file.name,
        state: "pending",
        folderId,
      }))
    );
  }

  return {
    results: uploadResults,
    pending: uploading,
    destination: uploadDestination,
    start,
    retry: () => void runUploads(uploadResults),
    dismiss: () => setUploadResults([]),
  };
}
