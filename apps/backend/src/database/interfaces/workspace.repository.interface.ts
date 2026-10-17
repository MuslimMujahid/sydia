import type {
  WorkspaceCommit,
  WorkspaceDailyDocument,
  WorkspaceItem,
} from '../entities';

export const WORKSPACE_REPOSITORY = Symbol('IWorkspaceRepository');

export interface IWorkspaceRepository {
  list(userId: string): Promise<WorkspaceItem[]>;
  dailyDocuments(userId: string): Promise<WorkspaceDailyDocument[]>;
  pendingIndex(limit: number): Promise<Array<{ userId: string; id: string }>>;
  replaceIndex(
    userId: string,
    id: string,
    input: {
      signature: string;
      model: string;
      version: string;
      chunks: string[];
      embeddings: number[][];
    },
  ): Promise<boolean>;
  searchVector(
    userId: string,
    embedding: number[],
    model: string,
    version: string,
    limit: number,
  ): Promise<Array<{ id: string; passage: string }>>;
  /** Serialize owner-scoped hierarchy changes inside a database transaction. */
  transact<T>(
    userId: string,
    change: (items: WorkspaceItem[]) => WorkspaceCommit<T>,
  ): Promise<T>;
}
