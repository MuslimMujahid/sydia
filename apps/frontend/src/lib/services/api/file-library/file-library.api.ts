import type { AxiosResponse } from "axios";
import { api, toApiError } from "../api";
import type { ApiListResponse, ApiResponse } from "../api.types";

export type LibraryRef = {
  kind: "file" | "folder";
  id: string;
  revision: number;
};
export type LibraryCrumb = { id: string; name: string };
export type LibraryItem = LibraryRef & {
  name: string;
  parentId: string | null;
  createdAt: string;
  deletingOperationId: string | null;
  size: number | null;
  mimeType: string | null;
  fileKind: string | null;
  status: string | null;
  childCount: number | null;
  path: LibraryCrumb[];
};
export type LibraryFolder = LibraryCrumb & {
  parentId: string | null;
  revision: number;
  deletingOperationId: string | null;
};
export type LibraryFilters = {
  folderId?: string;
  q?: string;
  offset: number;
  limit: number;
  sort: "name" | "createdAt";
  direction: "asc" | "desc";
  foldersOnly?: "true";
};
export type DeletionOperation = {
  id: string;
  status: "preview" | "running" | "completed" | "partial";
  selection: LibraryRef[];
  files: { total: number; completed: number; failed: number; pending: number };
  folders: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    retained: number;
  };
};
export type DeletionFailure = {
  itemId: string;
  kind: "file" | "folder";
  name: string;
  state: "failed" | "blocked";
  error: string;
};

async function request<T>(
  action: () => Promise<AxiosResponse<T>>,
  message: string
): Promise<T> {
  try {
    return (await action()).data;
  } catch (error: unknown) {
    console.error("File library request failed", { message });
    throw toApiError(error, message);
  }
}

export const libraryRef = (item: LibraryRef): LibraryRef => ({
  kind: item.kind,
  id: item.id,
  revision: item.revision,
});
export const libraryItemKey = (item: LibraryRef) => `${item.kind}:${item.id}`;

export function getLibraryItems(filters: LibraryFilters) {
  return request(
    () =>
      api.get<ApiListResponse<LibraryItem>>(
        filters.q ? "/file-library/search" : "/file-library/items",
        { params: filters }
      ),
    "File tidak dapat dimuat."
  );
}

export function getLibraryFolder(id: string) {
  return request(
    () =>
      api.get<ApiResponse<{ folder: LibraryFolder; path: LibraryCrumb[] }>>(
        `/file-library/folders/${encodeURIComponent(id)}`
      ),
    "Folder tidak dapat dimuat."
  );
}

export function createLibraryFolder(values: {
  name: string;
  parentId: string | null;
}) {
  return request(
    () => api.post<ApiResponse<LibraryFolder>>("/file-library/folders", values),
    "Folder tidak dapat dibuat."
  );
}

export function renameLibraryFolder(values: {
  id: string;
  name: string;
  revision: number;
}) {
  return request(
    () =>
      api.patch<ApiResponse<LibraryFolder>>(
        `/file-library/folders/${encodeURIComponent(values.id)}`,
        { name: values.name, revision: values.revision }
      ),
    "Nama folder tidak dapat disimpan."
  );
}

export function moveLibraryItems(values: {
  items: LibraryRef[];
  destinationId: string | null;
}) {
  return request(
    () =>
      api.post<ApiResponse<{ moved: boolean }>>("/file-library/moves", values),
    "Item tidak dapat dipindahkan."
  );
}

export function previewLibraryDeletion(items: LibraryRef[]) {
  return request(
    () =>
      api.post<ApiResponse<DeletionOperation>>(
        "/file-library/delete-previews",
        { items }
      ),
    "Pilihan hapus tidak dapat diperiksa."
  );
}

export function startLibraryDeletion(values: {
  previewId: string;
  idempotencyKey: string;
}) {
  return request(
    () =>
      api.post<ApiResponse<DeletionOperation>>(
        "/file-library/deletions",
        values
      ),
    "Penghapusan belum dapat dikonfirmasi. Periksa status sebelum mencoba lagi."
  );
}

export function getLibraryDeletions(offset = 0) {
  return request(
    () =>
      api.get<ApiListResponse<DeletionOperation>>("/file-library/deletions", {
        params: { offset, limit: 10 },
      }),
    "Status penghapusan tidak dapat dimuat."
  );
}

export function getLibraryDeletionFailures(id: string, offset: number) {
  return request(
    () =>
      api.get<ApiListResponse<DeletionFailure>>(
        `/file-library/deletions/${encodeURIComponent(id)}/failures`,
        { params: { offset, limit: 10 } }
      ),
    "Rincian penghapusan tidak dapat dimuat."
  );
}

export function retryLibraryDeletion(values: {
  id: string;
  previewId?: string;
}) {
  return request(
    () =>
      api.post<ApiResponse<DeletionOperation>>(
        `/file-library/deletions/${encodeURIComponent(values.id)}/retry`,
        { previewId: values.previewId }
      ),
    "Penghapusan tidak dapat dicoba ulang. Periksa apakah isi folder berubah."
  );
}

export function previewLibraryDeletionRetry(id: string) {
  return request(
    () =>
      api.post<ApiResponse<DeletionOperation>>(
        `/file-library/deletions/${encodeURIComponent(id)}/retry-preview`
      ),
    "Item tersisa tidak dapat diperiksa."
  );
}
