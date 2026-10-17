import type { FileFolder as PrismaFileFolder } from '../../generated/prisma/client';

export type FileLibraryKind = 'file' | 'folder';

export type FileLibraryRef = {
  kind: FileLibraryKind;
  id: string;
  revision: number;
};

export type FileFolder = Pick<
  PrismaFileFolder,
  | 'id'
  | 'userId'
  | 'parentId'
  | 'name'
  | 'normalizedName'
  | 'revision'
  | 'deletingOperationId'
  | 'createdAt'
  | 'updatedAt'
>;

export type FileBreadcrumb = { id: string; name: string };

export type FileLibraryItem = {
  id: string;
  kind: FileLibraryKind;
  name: string;
  parentId: string | null;
  revision: number;
  createdAt: Date;
  deletingOperationId: string | null;
  size: number | null;
  mimeType: string | null;
  fileKind: string | null;
  status: string | null;
  childCount: number | null;
  path: FileBreadcrumb[];
};

export type FileLibraryFilters = {
  folderId: string | null;
  query?: string;
  foldersOnly?: boolean;
  offset: number;
  limit: number;
  sort: 'name' | 'createdAt';
  direction: 'asc' | 'desc';
};

export type FileLibraryPage = {
  items: FileLibraryItem[];
  total: number;
};

export type FileLibraryFailureReason =
  | 'not_found'
  | 'invalid_name'
  | 'duplicate_name'
  | 'cycle'
  | 'stale_revision'
  | 'operation_in_progress'
  | 'stale_confirmation';

export class FileLibraryError extends Error {
  constructor(
    readonly reason: FileLibraryFailureReason,
    message: string,
    readonly details?: Record<string, string | boolean | null>,
  ) {
    super(message);
    this.name = 'FileLibraryError';
  }
}

/** The stored key is also the database uniqueness key; never use host locale. */
export function fileFolderName(input: string): {
  name: string;
  normalizedName: string;
} {
  const name = input.trim().normalize('NFC');
  if (
    Array.from(name).length < 1 ||
    Array.from(name).length > 255 ||
    name === '.' ||
    name === '..' ||
    /[\p{Cc}/\\]/u.test(name)
  )
    throw new FileLibraryError(
      'invalid_name',
      'Nama folder harus 1–255 karakter, tanpa pemisah path atau karakter kontrol.',
    );

  return { name, normalizedName: name.toLowerCase() };
}

export function libraryUnavailable(): never {
  throw new FileLibraryError('not_found', 'File atau folder tidak ditemukan.');
}

export function assertLibraryRevision(actual: number, expected: number): void {
  if (actual !== expected)
    throw new FileLibraryError(
      'stale_revision',
      'Item telah berubah. Muat ulang sebelum mencoba lagi.',
    );
}

export function assertLibraryUnlocked(operationId: string | null): void {
  if (operationId)
    throw new FileLibraryError(
      'operation_in_progress',
      'Item sedang dihapus. Tunggu hingga proses selesai.',
    );
}
