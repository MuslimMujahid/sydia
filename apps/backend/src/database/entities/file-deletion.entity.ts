import type {
  FileDeletionItem as PrismaItem,
  FileDeletionOperation as PrismaOperation,
} from '../../generated/prisma/client';
import type { FileLibraryRef } from './file-library.entity';

export type FileDeletionItem = Omit<PrismaItem, 'kind' | 'state'> & {
  kind: 'file' | 'folder';
  state: 'pending' | 'completed' | 'failed' | 'blocked';
};
export type FileDeletionOperation = Omit<
  PrismaOperation,
  | 'selection'
  | 'status'
  | 'fingerprint'
  | 'idempotencyKey'
  | 'leaseUntil'
  | 'workerFailures'
> & {
  status: 'preview' | 'running' | 'completed' | 'partial';
  selection: FileLibraryRef[];
  files: { total: number; completed: number; failed: number; pending: number };
  folders: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    retained: number;
  };
};
export type FileDeletionClaim = {
  operationId: string;
  userId: string;
  leaseUntil: Date;
};
