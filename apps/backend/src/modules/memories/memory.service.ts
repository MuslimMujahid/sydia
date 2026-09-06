import { Inject, Injectable } from '@nestjs/common';
import {
  MEMORY_REPOSITORY,
  type IMemoryRepository,
} from '../../database/interfaces';
import type { Memory, MemoryWrite } from '../../database/entities';
import { EmbeddingsService } from '../../infra/embeddings';

@Injectable()
export class MemoryService {
  constructor(
    @Inject(MEMORY_REPOSITORY) private readonly memories: IMemoryRepository,
    private readonly embeddings: EmbeddingsService,
  ) {}

  async create(userId: string, input: MemoryWrite): Promise<Memory> {
    const memory = await this.memories.create(userId, input);
    await this.index(memory);

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
        });

        if (memory) await this.index(memory);

        return memory;
      }
    }

    return this.memories.update(userId, id, input);
  }

  async search(userId: string, query: string, limit = 10): Promise<Memory[]> {
    const keyword = await this.memories.searchKeyword(userId, query, limit);

    try {
      const embedding = await this.embeddings.embed(query);
      if (!embedding) return keyword;

      const semantic = await this.memories.searchVector(
        userId,
        embedding,
        limit,
      );

      const merged = new Map<string, Memory>();

      for (const memory of [...keyword, ...semantic]) {
        merged.set(memory.id, memory);
      }

      return [...merged.values()].slice(0, limit);
    } catch {
      return keyword;
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
