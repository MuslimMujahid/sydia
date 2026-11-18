import type { Document } from "@/lib/services/api/documents/documents.api";
import type { SupportedLocale } from "@/lib/services/api/users/users.queries";

export function skippedDocumentImages(document: Document): number {
  const count = document.structuredData?.skippedImageCount;

  return document.status === "ready" && typeof count === "number" ? count : 0;
}

export function formatSkippedDocumentImages(
  count: number,
  locale: SupportedLocale
): string {
  if (locale === "id") return `${count} gambar tidak dianalisis`;

  return count === 1 ? "1 image skipped" : `${count} images skipped`;
}
