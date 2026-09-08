import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MEMORY_REPOSITORY,
  type IMemoryRepository,
} from '../../database/interfaces';
import type { Memory, MemoryWrite } from '../../database/entities';
import { EmbeddingsService } from '../../infra/embeddings';

const RRF_K = 60;
const CANDIDATE_MULTIPLIER = 3;

type RankedMemory = {
  memory: Memory;
  score: number;
};

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly maxCosineDistance: number;

  constructor(
    @Inject(MEMORY_REPOSITORY) private readonly memories: IMemoryRepository,
    private readonly embeddings: EmbeddingsService,
    config: ConfigService,
  ) {
    this.maxCosineDistance = config.get<number>(
      'BACKEND_MEMORY_MAX_COSINE_DISTANCE',
      0.3,
    );
  }

  async create(userId: string, input: MemoryWrite): Promise<Memory> {
    const memory = await this.memories.create(userId, input);
    await this.index(memory);

    return memory;
  }

  findBySourceKey(userId: string, sourceKey: string): Promise<Memory | null> {
    return this.memories.findBySourceKey(userId, sourceKey);
  }

  async consolidate(
    userId: string,
    id: string,
    input: MemoryWrite,
  ): Promise<Memory | null> {
    const memory = await this.memories.supersede(userId, id, input);
    if (memory) await this.index(memory);

    return memory;
  }

  async update(
    userId: string,
    id: string,
    input: Partial<MemoryWrite>,
  ): Promise<Memory | null> {
    if (input.content) {
      const current = await this.memories.findById(userId, id);
      if (!current) return null;

      if (current.content !== input.content) {
        const memory = await this.memories.supersede(userId, id, {
          content: input.content,
          category: input.category ?? current.category,
          pinned: input.pinned ?? current.pinned,
          sourceType: current.source.type,
          sourceMessageId: current.source.messageId,
          sourceMessageIds: current.sourceMessageIds,
        });

        if (memory) await this.index(memory);

        return memory;
      }
    }

    return this.memories.update(userId, id, input);
  }

  async search(userId: string, query: string, limit = 10): Promise<Memory[]> {
    const candidateLimit = Math.max(limit, limit * CANDIDATE_MULTIPLIER);
    const keyword = await this.memories.searchKeyword(
      userId,
      query,
      candidateLimit,
    );

    try {
      const embedding = await this.embeddings.embed(query);

      if (!embedding) {
        const results = keyword.slice(0, limit);
        await this.recordRetrieval(results);

        return results;
      }

      const semantic = await this.memories.searchVector(
        userId,
        embedding,
        candidateLimit,
        this.maxCosineDistance,
      );

      const ranked = new Map<string, RankedMemory>();

      keyword.forEach((memory, index) => {
        ranked.set(memory.id, {
          memory,
          score: 1 / (RRF_K + index + 1),
        });
      });
      semantic.forEach(({ memory }, index) => {
        const existing = ranked.get(memory.id);

        ranked.set(memory.id, {
          memory,
          score: (existing?.score ?? 0) + 1 / (RRF_K + index + 1),
        });
      });

      const results = [...ranked.values()]
        .sort(
          (left, right) =>
            right.score - left.score ||
            Number(right.memory.pinned) - Number(left.memory.pinned) ||
            right.memory.updatedAt.getTime() - left.memory.updatedAt.getTime(),
        )
        .slice(0, limit)
        .map(({ memory }) => memory);

      await this.recordRetrieval(results);

      this.logger.debug(
        `Memory retrieval fused keyword=${keyword.length} semantic=${semantic.length} returned=${results.length}`,
      );

      return results;
    } catch (error) {
      const results = keyword.slice(0, limit);
      await this.recordRetrieval(results);
      this.logger.warn(
        `Memory semantic retrieval failed; keyword fallback returned=${results.length}`,
        error instanceof Error ? error.stack : undefined,
      );

      return results;
    }
  }

  private async recordRetrieval(memories: Memory[]): Promise<void> {
    try {
      await this.memories.recordRetrieval(memories.map(({ id }) => id));
    } catch (error) {
      this.logger.warn(
        'Memory retrieval usage update failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async index(memory: Memory): Promise<void> {
    try {
      const embedding = await this.embeddings.embed(memory.content);
      if (!embedding) return;

      await this.memories.setEmbedding(
        memory.id,
        embedding,
        this.embeddings.modelName(),
        this.embeddings.version,
      );
    } catch {
      // Canonical memory remains authoritative; retrieval falls back to keywords.
    }
  }
}
