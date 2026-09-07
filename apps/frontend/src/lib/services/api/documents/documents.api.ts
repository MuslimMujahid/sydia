import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
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

export type UploadDocumentInput = {
  file: File;
  conversationId?: string;
};

const documentIdSchema = z.string().min(1);

const getDocumentsServer = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<Document[]>>("/documents", {
        headers: cookie ? { cookie } : undefined,
      });

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Daftar file tidak dapat dimuat.");
    }
  }
);

const getDocumentServer = createServerFn({ method: "GET" })
  .validator(documentIdSchema)
  .handler(async ({ data: documentId }) => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<Document>>(
        `/documents/${encodeURIComponent(documentId)}`,
        { headers: cookie ? { cookie } : undefined }
      );

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Rincian file tidak dapat dimuat.");
    }
  });

export async function getDocuments(): Promise<Document[]> {
  if (typeof window === "undefined") return getDocumentsServer();

  try {
    const response = await api.get<ApiResponse<Document[]>>("/documents");

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Daftar file tidak dapat dimuat.");
  }
}

export async function getDocument(documentId: string): Promise<Document> {
  if (typeof window === "undefined")
    return getDocumentServer({ data: documentId });

  try {
    const response = await api.get<ApiResponse<Document>>(
      `/documents/${encodeURIComponent(documentId)}`
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
  conversationId,
}: UploadDocumentInput): Promise<Document> {
  const formData = new FormData();
  formData.append("file", file);
  if (conversationId) formData.append("conversationId", conversationId);

  try {
    const response = await api.post<ApiResponse<Document>>(
      "/documents",
      formData
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, `File ${file.name} tidak dapat diunggah.`);
  }
}

export async function deleteDocument(documentId: string): Promise<void> {
  try {
    await api.delete(`/documents/${encodeURIComponent(documentId)}`);
  } catch (error) {
    throw toApiError(error, "File tidak dapat dihapus.");
  }
}
