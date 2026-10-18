import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?worker&url";

GlobalWorkerOptions.workerSrc = workerUrl;

/** Render only the first page at thumbnail resolution, then release the PDF. */
export async function renderPdfThumbnail(
  canvas: HTMLCanvasElement,
  url: string,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) return;
  const task = getDocument({
    url,
    withCredentials: true,
  });

  const cancel = () => {
    void task.destroy().catch((error: unknown) => {
      console.error("PDF thumbnail cancellation failed", error);
    });
  };

  signal.addEventListener("abort", cancel, { once: true });

  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    if (signal.aborted) return;
    const original = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 384 / original.width });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
  } finally {
    signal.removeEventListener("abort", cancel);
    await task.destroy();
  }
}
