import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { UploadResult } from "./use-file-library-upload";

interface FileLibraryUploadResultsProps {
  results: UploadResult[];
  pending: boolean;
  destination: string;
  onRetry: () => void;
  onDismiss: () => void;
}

export function FileLibraryUploadResults({
  results,
  pending,
  destination,
  onRetry,
  onDismiss,
}: FileLibraryUploadResultsProps) {
  return (
    <>
      {results.length ? (
        <section aria-label="Hasil unggahan" className="files-upload-panel">
          <div className="flex items-center justify-between gap-3">
            <p className="files-upload-title">
              <Upload aria-hidden="true" />
              {pending ? `Mengunggah ${results.length} file` : "Hasil unggahan"}
            </p>
            {!pending ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Tutup hasil unggahan"
                onClick={onDismiss}
              >
                <X />
              </Button>
            ) : null}
          </div>
          <p className="files-upload-destination">Ke {destination}</p>
          {results.map((result, index) => (
            <div
              key={index}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span className="min-w-0 truncate">{result.name}</span>
              <span
                className={cn(
                  result.state === "failed"
                    ? "text-destructive"
                    : "text-ink-muted"
                )}
              >
                {result.state === "completed"
                  ? "Diunggah"
                  : result.state === "failed"
                    ? result.error
                    : result.state === "uploading"
                      ? "Mengunggah…"
                      : "Menunggu"}
              </span>
            </div>
          ))}
          <progress
            aria-label="Progres unggahan"
            max={results.length}
            value={results.filter((item) => item.state === "completed").length}
          />
          <p className="files-upload-summary">
            {results.filter((item) => item.state === "completed").length}{" "}
            selesai{pending ? " · sedang mengunggah" : ""}
            {results.some((item) => item.state === "failed")
              ? ` · ${results.filter((item) => item.state === "failed").length} gagal`
              : ""}
          </p>
          {!pending && results.some((item) => item.state === "failed") ? (
            <Button variant="dark-outline" size="sm" onClick={onRetry}>
              Coba ulang unggahan gagal
            </Button>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
