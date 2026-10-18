import { FileImage, FileText, Music2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getDocumentContentUrl } from "@/lib/services/api/documents/documents.api";
import type { LibraryItem } from "@/lib/services/api/file-library/file-library.api";

interface FileLibraryThumbnailProps {
  item: LibraryItem;
}

/** Unsupported formats use a type preview. Failed previews are visibly marked. */
export function FileLibraryThumbnail({ item }: FileLibraryThumbnailProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const image = item.fileKind === "image";
  const pdf = item.mimeType === "application/pdf" || /\.pdf$/i.test(item.name);
  const previewable = image || pdf;
  const url = getDocumentContentUrl(item.id);
  const Icon =
    item.fileKind === "audio" ? Music2 : image ? FileImage : FileText;

  const format = item.name.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toUpperCase();

  function fail(error: unknown) {
    console.warn("File thumbnail unavailable", { documentId: item.id, error });
    setState("failed");
  }

  useEffect(() => {
    if (!pdf || image || !canvas.current) return;
    const target = canvas.current;
    const controller = new AbortController();
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        void import("./render-pdf-thumbnail")
          .then(({ renderPdfThumbnail }) =>
            renderPdfThumbnail(target, url, controller.signal)
          )
          .then(() => {
            if (!controller.signal.aborted) setState("ready");
          })
          .catch((error: unknown) => {
            // Unmounting or switching views intentionally cancels pending work.
            if (controller.signal.aborted) return;
            console.warn("File thumbnail unavailable", {
              documentId: item.id,
              error,
            });
            setState("failed");
          });
      },
      { rootMargin: "200px" }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [image, item.id, pdf, url]);

  return (
    <a
      className="files-thumbnail"
      href={url}
      target="_blank"
      rel="noreferrer"
      draggable={false}
      aria-label={`Buka ${item.name}`}
    >
      {previewable && state !== "failed" ? (
        <>
          {state === "loading" ? (
            <span className="files-thumbnail-loading" role="status">
              <span className="sr-only">Memuat pratinjau {item.name}</span>
            </span>
          ) : null}
          {image ? (
            <img
              src={url}
              alt={`Pratinjau ${item.name}`}
              loading="lazy"
              decoding="async"
              draggable={false}
              onLoad={() => setState("ready")}
              onError={() =>
                fail(new Error("Image preview could not be loaded"))
              }
            />
          ) : (
            <canvas
              ref={canvas}
              role="img"
              aria-label={`Pratinjau ${item.name}`}
            />
          )}
        </>
      ) : (
        <span className="files-thumbnail-type">
          <Icon aria-hidden="true" />
          {state === "failed" ? (
            <span>Pratinjau tidak tersedia</span>
          ) : format ? (
            <span>{format}</span>
          ) : null}
        </span>
      )}
    </a>
  );
}
