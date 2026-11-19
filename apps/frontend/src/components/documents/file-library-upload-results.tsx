import {
  AlertCircle,
  Check,
  ChevronDown,
  FileText,
  LoaderCircle,
  X,
} from "lucide-react";
import { useFileLibraryUpload } from "./file-upload-provider";
import "./file-upload-panel.css";

/** App-wide upload tracker; stays mounted across page navigation. */
export function FileLibraryUploadResults() {
  const {
    results,
    pending,
    destination,
    collapsed,
    setCollapsed,
    retry,
    dismiss,
  } = useFileLibraryUpload();

  if (!results.length) return null;

  const completed = results.filter((item) => item.state === "completed").length;
  const failed = results.filter((item) => item.state === "failed").length;
  const status = pending ? "uploading" : failed ? "failed" : "completed";
  const title = pending
    ? `Mengunggah ${Math.min(completed + 1, results.length)} dari ${results.length} file`
    : failed
      ? `${failed} file gagal diunggah`
      : `${completed} file diunggah`;

  return (
    <section
      aria-label="Hasil unggahan"
      className="upload-panel"
      data-status={status}
      data-collapsed={collapsed || undefined}
    >
      <header className="upload-panel-header">
        <button
          type="button"
          className="upload-panel-toggle"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          <span className="upload-panel-icon" aria-hidden="true">
            {status === "uploading" ? (
              <LoaderCircle className="animate-spin" />
            ) : status === "failed" ? (
              <AlertCircle />
            ) : (
              <Check />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="upload-panel-title" aria-live="polite">
              {title}
            </span>
            <span className="upload-panel-destination">Ke {destination}</span>
          </span>
          <ChevronDown className="upload-panel-chevron" aria-hidden="true" />
          <span className="sr-only">
            {collapsed ? "Tampilkan rincian" : "Sembunyikan rincian"}
          </span>
        </button>
        {pending ? null : (
          <button
            type="button"
            className="upload-panel-close"
            aria-label="Tutup hasil unggahan"
            onClick={dismiss}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </header>
      {pending ? (
        <progress
          className="upload-panel-progress"
          aria-label="Progres unggahan"
          max={results.length}
          value={completed}
        />
      ) : null}
      {collapsed ? null : (
        <>
          <ul className="upload-panel-list">
            {results.map((result, index) => (
              <li key={index} className="upload-panel-item">
                <FileText className="upload-panel-file" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="upload-panel-name">{result.name}</span>
                  {result.state === "failed" ? (
                    <span className="upload-panel-error">{result.error}</span>
                  ) : null}
                </span>
                <span className="upload-panel-state" data-state={result.state}>
                  {result.state === "completed" ? (
                    <Check aria-label="Diunggah" />
                  ) : result.state === "uploading" ? (
                    <LoaderCircle
                      className="animate-spin"
                      aria-label="Mengunggah"
                    />
                  ) : result.state === "failed" ? (
                    <AlertCircle aria-label="Gagal" />
                  ) : (
                    "Menunggu"
                  )}
                </span>
              </li>
            ))}
          </ul>
          {!pending && failed ? (
            <div className="upload-panel-footer">
              <button type="button" onClick={retry}>
                Coba ulang unggahan gagal
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
