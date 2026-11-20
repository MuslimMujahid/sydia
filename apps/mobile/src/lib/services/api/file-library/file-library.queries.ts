import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
} from "@tanstack/react-query";
import { ApiClientError } from "../api";
import {
  createLibraryFolder,
  getLibraryDeletionFailures,
  getLibraryDeletions,
  getLibraryFolder,
  getLibraryItems,
  moveLibraryItems,
  previewLibraryDeletionRetry,
  renameLibraryFolder,
  retryLibraryDeletion,
  startLibraryDeletion,
  type LibraryFilters,
} from "./file-library.api";

export const libraryQueryKeys = { all: ["file-library"] as const };

/** Page size for library listings; the backend allows up to 100. */
export const LIBRARY_PAGE_SIZE = 50;

export const libraryQueryOptions = (filters: LibraryFilters) =>
  queryOptions({
    queryKey: [...libraryQueryKeys.all, "items", filters],
    queryFn: () => getLibraryItems(filters),
    refetchInterval: (query) =>
      query.state.data?.data.some(
        (item) => item.status === "processing" || item.deletingOperationId
      )
        ? 3000
        : false,
  });

export type LibraryListFilters = Omit<LibraryFilters, "offset" | "limit">;

/**
 * Offset pages loaded as the list scrolls. Polls while any loaded item is
 * still processing or being deleted, like the web listing.
 */
export const libraryInfiniteQueryOptions = (filters: LibraryListFilters) =>
  infiniteQueryOptions({
    queryKey: [...libraryQueryKeys.all, "infinite", filters],
    queryFn: ({ pageParam }) =>
      getLibraryItems({
        ...filters,
        offset: pageParam,
        limit: LIBRARY_PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const next = lastPage.pagination.offset + lastPage.pagination.limit;

      return next < lastPage.pagination.total ? next : undefined;
    },
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) =>
        page.data.some(
          (item) => item.status === "processing" || item.deletingOperationId
        )
      )
        ? 3000
        : false,
  });

export const libraryFolderOptions = (id?: string) =>
  queryOptions({
    queryKey: [...libraryQueryKeys.all, "folder", id],
    queryFn: () => getLibraryFolder(id!),
    enabled: Boolean(id),
    retry: (attempt, error) =>
      !(error instanceof ApiClientError && error.status === 404) && attempt < 2,
  });

export const libraryDeletionOptions = (offset = 0) =>
  queryOptions({
    queryKey: [...libraryQueryKeys.all, "deletions", offset],
    queryFn: () => getLibraryDeletions(offset),
    refetchInterval: (query) =>
      query.state.data?.data.some((operation) => operation.status === "running")
        ? 3000
        : false,
  });

export const libraryDeletionFailuresOptions = (id: string, offset: number) =>
  queryOptions({
    queryKey: [...libraryQueryKeys.all, "failures", id, offset],
    queryFn: () => getLibraryDeletionFailures(id, offset),
  });

const invalidates = { invalidateQueries: [libraryQueryKeys.all] };

export function useCreateLibraryFolder() {
  return useMutation({ mutationFn: createLibraryFolder, meta: invalidates });
}

export function useRenameLibraryFolder() {
  return useMutation({ mutationFn: renameLibraryFolder, meta: invalidates });
}

export function useMoveLibraryItems() {
  return useMutation({ mutationFn: moveLibraryItems, meta: invalidates });
}

export function useStartLibraryDeletion() {
  return useMutation({ mutationFn: startLibraryDeletion, meta: invalidates });
}

export function useRetryLibraryDeletion() {
  return useMutation({ mutationFn: retryLibraryDeletion, meta: invalidates });
}

export function usePreviewLibraryDeletionRetry() {
  return useMutation({ mutationFn: previewLibraryDeletionRetry });
}
