import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type DocumentStatus = "processing" | "ready" | "failed";
export type FileKind = "document" | "image" | "audio";

export type DocumentFile = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: FileKind;
  createdAt: string;
};

export type DocumentChunk = {
  id: string;
  chunkIndex: number;
  pageNumber: number | null;
  content: string;
};

export type Document = {
  id: string;
  title: string;
  description: string | null;
  status: DocumentStatus;
  textContent: string | null;
  transcript: string | null;
  imageDescription: string | null;
  structuredData: Record<string, string | number | boolean | null> | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  file: DocumentFile;
  chunks?: DocumentChunk[];
};

/** A local file picked from the camera, photo library, or document picker. */
export type LocalUploadFile = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number | null;
};

export type UploadDocumentInput = {
  file: LocalUploadFile;
  folderId?: string;
  conversationId?: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

export type UpdateDocumentInput = {
  title?: string;
  description?: string | null;
};

export async function getDocuments(): Promise<Document[]> {
  try {
    const response = await api.get<ApiResponse<Document[]>>("/documents");

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Daftar file tidak dapat dimuat.");
  }
}

export async function getDocument(
  documentId: string,
  options: { signal?: AbortSignal } = {}
): Promise<Document> {
  try {
    const response = await api.get<ApiResponse<Document>>(
      `/documents/${encodeURIComponent(documentId)}`,
      { signal: options.signal }
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Rincian file tidak dapat dimuat.");
  }
}

export function getDocumentContentUrl(documentId: string): string {
  const baseUrl = String(api.defaults.baseURL ?? "").replace(/\/$/, "");

  return `${baseUrl}/documents/${encodeURIComponent(documentId)}/content`;
}

export async function uploadDocument({
  file,
  folderId,
  conversationId,
  onProgress,
  signal,
}: UploadDocumentInput): Promise<Document> {
  const formData = new FormData();
  // React Native's FormData streams a file part from its local URI.
  formData.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as unknown as Blob);
  if (folderId) formData.append("folderId", folderId);
  if (conversationId) formData.append("conversationId", conversationId);

  try {
    const response = await api.post<ApiResponse<Document>>(
      "/documents",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        // Large photos and PDFs can take a while on mobile networks.
        timeout: 5 * 60_000,
        signal,
        onUploadProgress: (event) => {
          if (event.total) onProgress?.(event.loaded / event.total);
        },
      }
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, `File ${file.name} tidak dapat diunggah.`);
  }
}

export async function retryDocument(documentId: string): Promise<Document> {
  try {
    const response = await api.post<ApiResponse<Document>>(
      `/documents/${encodeURIComponent(documentId)}/retry`
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Pemrosesan file tidak dapat dicoba ulang.");
  }
}

export async function deleteDocument(documentId: string): Promise<void> {
  try {
    await api.delete(`/documents/${encodeURIComponent(documentId)}`);
  } catch (error) {
    throw toApiError(error, "File tidak dapat dihapus.");
  }
}

export async function updateDocument(
  documentId: string,
  input: UpdateDocumentInput
): Promise<Document> {
  try {
    const response = await api.patch<ApiResponse<Document>>(
      `/documents/${encodeURIComponent(documentId)}`,
      input
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Perubahan file tidak dapat disimpan.");
  }
}
