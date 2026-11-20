import type {
  DeletionOperation,
  LibraryCrumb,
  LibraryFilters,
} from "@/lib/services/api/file-library/file-library.api";

/** Status line for a library item, matching the web's labels. */
export function itemStatusLabel({
  status,
  deleting,
  skippedImageCount,
}: {
  status: string | null;
  deleting: boolean;
  skippedImageCount?: number | null;
}): string | null {
  if (deleting) return "Menghapus…";
  if (status === "processing") return "Diproses";
  if (status === "failed") return "Gagal diproses";
  if (status === "ready" && skippedImageCount)
    return formatSkippedImages(skippedImageCount);

  return status ? "Siap" : null;
}

export function formatSkippedImages(count: number): string {
  return `${count} gambar tidak dianalisis`;
}

/** Upper-case extension ("PDF") for a type tile, or null when absent. */
export function fileExtension(name: string): string | null {
  return name.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toUpperCase() ?? null;
}

/** "File saya / Keluarga / KK" for a folder path. */
export function libraryPathLabel(path: LibraryCrumb[]): string {
  return ["File saya", ...path.map((crumb) => crumb.name)].join(" / ");
}

/** "2 file dan 1 folder", or "Pilihan ini" when both counts are zero. */
export function deletionCountLabel(files: number, folders: number): string {
  const parts = [
    files ? `${files} file` : null,
    folders ? `${folders} folder` : null,
  ].filter(Boolean);

  return parts.length ? parts.join(" dan ") : "Pilihan ini";
}

/** Confirmation line once a deletion operation finishes. */
export function deletedSummary({ files, folders }: DeletionOperation): string {
  const parts = [
    files.completed ? `${files.completed} file` : null,
    folders.completed ? `${folders.completed} folder` : null,
  ].filter(Boolean);

  return parts.length
    ? `${parts.join(" dan ")} dihapus`
    : "Penghapusan selesai";
}

export type LibrarySort = Pick<LibraryFilters, "sort" | "direction">;

export const SORT_OPTIONS: readonly (LibrarySort & { label: string })[] = [
  { sort: "name", direction: "asc", label: "Nama: A–Z" },
  { sort: "name", direction: "desc", label: "Nama: Z–A" },
  { sort: "createdAt", direction: "desc", label: "Terbaru ditambahkan" },
  { sort: "createdAt", direction: "asc", label: "Terlama ditambahkan" },
];

export function sortLabel({ sort, direction }: LibrarySort): string {
  return (
    SORT_OPTIONS.find(
      (option) => option.sort === sort && option.direction === direction
    )?.label ?? "Nama: A–Z"
  );
}

/**
 * A folder cannot receive a selection that contains itself or one of its
 * ancestors; moving it there would create a cycle.
 */
export function isUnavailableDestination(
  selectedFolderIds: ReadonlySet<string>,
  folderId: string,
  ancestors: readonly { id: string }[]
): boolean {
  return (
    selectedFolderIds.has(folderId) ||
    ancestors.some((ancestor) => selectedFolderIds.has(ancestor.id))
  );
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  rtf: "application/rtf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  html: "text/html",
  htm: "text/html",
  json: "application/json",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  opus: "audio/ogg",
};

/** MIME type from a file name when the picker could not report one. */
export function guessMimeType(name: string): string | null {
  const extension = fileExtension(name)?.toLowerCase();

  return extension ? (MIME_BY_EXTENSION[extension] ?? null) : null;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/**
 * Keeps an upload's name consistent with its bytes: iOS can report
 * `IMG_0001.HEIC` for a photo it already converted to JPEG, and some pickers
 * return names without an extension.
 */
export function normalizeUploadName(name: string, mimeType: string): string {
  const trimmed = name.trim() || "file";
  const wanted = EXTENSION_BY_MIME[mimeType.toLowerCase()];
  if (!wanted) return trimmed;
  const current = fileExtension(trimmed)?.toLowerCase();
  if (current === wanted || (wanted === "jpg" && current === "jpeg"))
    return trimmed;
  const base = current ? trimmed.slice(0, -(current.length + 1)) : trimmed;

  return `${base}.${wanted}`;
}

/** File-system-safe name for a cached download, keeping the extension. */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const basename = cleaned.slice(-120);

  return basename && basename !== "." && basename !== ".." ? basename : "file";
}

/** "foto-20261119-221530.jpg" for a camera capture taken at `date`. */
export function cameraFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `foto-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.jpg`;
}

const KIND_LABELS: Record<string, string> = {
  document: "Dokumen",
  image: "Gambar",
  audio: "Audio",
};

export function fileKindLabel(kind: string | null | undefined): string {
  return (kind && KIND_LABELS[kind]) || "File";
}

/** Structured-data keys the pipeline uses internally, never shown as content. */
const INTERNAL_STRUCTURED_KEYS = new Set(["skippedImageCount"]);

export function visibleStructuredData(
  data: Record<string, string | number | boolean | null> | null
): [string, string][] {
  if (!data) return [];

  return Object.entries(data)
    .filter(
      ([key, value]) =>
        !INTERNAL_STRUCTURED_KEYS.has(key) && value !== null && value !== ""
    )
    .map(([key, value]) => [
      humanizeKey(key),
      typeof value === "boolean" ? (value ? "Ya" : "Tidak") : String(value),
    ]);
}

/** "invoiceNumber" / "invoice_number" → "Invoice number". */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();

  return words ? words[0]!.toUpperCase() + words.slice(1) : key;
}
