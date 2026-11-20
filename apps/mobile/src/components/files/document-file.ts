import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { authHeaders } from "@/lib/services/api/api";
import { getDocumentContentUrl } from "@/lib/services/api/documents/documents.api";
import { fileExtension, guessMimeType, safeFileName } from "./file-format";

/** What the device needs to fetch and hand a stored file to other apps. */
export type DownloadableDocument = {
  id: string;
  title: string;
  mimeType: string | null;
  size?: number | null;
  /** Original upload name, used for its extension when the title has none. */
  originalName?: string | null;
};

function cachedName(document: DownloadableDocument): string {
  const title = safeFileName(document.title);
  const extension =
    fileExtension(title) ??
    (document.originalName ? fileExtension(document.originalName) : null);

  return extension && !fileExtension(title)
    ? `${title}.${extension.toLowerCase()}`
    : title;
}

/**
 * Downloads a document's bytes into the cache (with the session cookie) and
 * returns the local file. A cached copy of the same size is reused.
 */
export async function downloadDocument(
  document: DownloadableDocument,
  signal?: AbortSignal
): Promise<File> {
  const directory = new Directory(Paths.cache, "documents", document.id);
  directory.create({ idempotent: true, intermediates: true });
  const target = new File(directory, cachedName(document));

  if (target.exists && document.size && target.size === document.size)
    return target;

  return File.downloadFileAsync(getDocumentContentUrl(document.id), target, {
    headers: await authHeaders(),
    idempotent: true,
    signal,
  });
}

function mimeTypeOf(document: DownloadableDocument, file: File): string {
  return (
    document.mimeType ||
    file.type ||
    guessMimeType(file.name) ||
    "application/octet-stream"
  );
}

/** Opens the file in Quick Look (iOS) or a matching app (Android). */
export async function openDocument(
  document: DownloadableDocument
): Promise<void> {
  const file = await downloadDocument(document);
  const mimeType = mimeTypeOf(document, file);

  if (await File.canPreview(file, { mimeType })) {
    await file.preview({ title: document.title, mimeType });

    return;
  }

  // No app can display this type; the share sheet still lets the user save it.
  await shareLocalFile(file, document.title, mimeType);
}

/** Hands the file to the native share sheet. */
export async function shareDocument(
  document: DownloadableDocument
): Promise<void> {
  const file = await downloadDocument(document);
  await shareLocalFile(file, document.title, mimeTypeOf(document, file));
}

async function shareLocalFile(file: File, title: string, mimeType: string) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Berbagi file tidak tersedia di perangkat ini.");

  await Sharing.shareAsync(file.uri, { dialogTitle: title, mimeType });
}
