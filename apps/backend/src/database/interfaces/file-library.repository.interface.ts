import type {
  FileBreadcrumb,
  FileFolder,
  FileLibraryFilters,
  FileLibraryPage,
  FileLibraryRef,
} from '../entities';

export interface IFileLibraryRepository {
  list(userId: string, filters: FileLibraryFilters): Promise<FileLibraryPage>;
  folder(
    userId: string,
    id: string,
  ): Promise<{
    folder: FileFolder;
    path: FileBreadcrumb[];
  }>;
  createFolder(
    userId: string,
    name: string,
    parentId: string | null,
  ): Promise<FileFolder>;
  renameFolder(
    userId: string,
    id: string,
    name: string,
    revision: number,
  ): Promise<FileFolder>;
  move(
    userId: string,
    items: FileLibraryRef[],
    destinationId: string | null,
  ): Promise<void>;
  assertUploadDestination(userId: string, folderId: string): Promise<void>;
  withFileMutation<T>(
    userId: string,
    documentId: string,
    action: () => Promise<T>,
  ): Promise<T>;
}

export const FILE_LIBRARY_REPOSITORY = Symbol('IFileLibraryRepository');
