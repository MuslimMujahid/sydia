import type { Memory, MemoryStatus, MemoryWrite } from '../entities';

export type MemoryFilters = { status?: MemoryStatus; pinned?: boolean };

export type MemoryVectorMatch = {
  memory: Memory;
  cosineDistance: number;
};

export interface IMemoryRepository {
  list(userId: string, filters?: MemoryFilters): Promise<Memory[]>;
  findById(userId: string, id: string): Promise<Memory | null>;
  findBySourceKey(userId: string, sourceKey: string): Promise<Memory | null>;
  create(userId: string, input: MemoryWrite): Promise<Memory>;
  update(
    userId: string,
    id: string,
    input: Partial<MemoryWrite>,
  ): Promise<Memory | null>;
  supersede(
    userId: string,
    id: string,
    input: MemoryWrite,
  ): Promise<Memory | null>;
  delete(userId: string, id: string): Promise<boolean>;
  searchKeyword(
    userId: string,
    query: string,
    limit: number,
  ): Promise<Memory[]>;
  searchVector(
    userId: string,
    embedding: number[],
    limit: number,
    maxCosineDistance: number,
  ): Promise<MemoryVectorMatch[]>;
  recordRetrieval(ids: string[]): Promise<void>;
  setEmbedding(
    id: string,
    embedding: number[],
    model: string,
    version: string,
  ): Promise<void>;
}

export const MEMORY_REPOSITORY = Symbol('IMemoryRepository');
