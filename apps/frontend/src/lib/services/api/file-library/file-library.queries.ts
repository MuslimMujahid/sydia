import { queryOptions } from "@tanstack/react-query";
import { ApiClientError } from "../api";
import {
  getLibraryDeletions,
  getLibraryFolder,
  getLibraryItems,
  type LibraryFilters,
} from "./file-library.api";

export const libraryQueryKeys = { all: ["file-library"] as const };
export const libraryQueryOptions = (filters: LibraryFilters) =>
  queryOptions({
    queryKey: [...libraryQueryKeys.all, "items", filters],
    queryFn: () => getLibraryItems(filters),
    enabled: typeof window !== "undefined",
    refetchInterval: (query) =>
      query.state.data?.data.some(
        (item) => item.status === "processing" || item.deletingOperationId
      )
        ? 3000
        : false,
  });
export const libraryFolderOptions = (id?: string) =>
  queryOptions({
    queryKey: [...libraryQueryKeys.all, "folder", id],
    queryFn: () => getLibraryFolder(id!),
    enabled: Boolean(id) && typeof window !== "undefined",
    retry: (attempt, error) =>
      !(error instanceof ApiClientError && error.status === 404) && attempt < 2,
  });
export const libraryDeletionOptions = (offset = 0) =>
  queryOptions({
    queryKey: [...libraryQueryKeys.all, "deletions", offset],
    queryFn: () => getLibraryDeletions(offset),
    enabled: typeof window !== "undefined",
    refetchInterval: (query) =>
      query.state.data?.data.some((operation) => operation.status === "running")
        ? 3000
        : false,
  });
