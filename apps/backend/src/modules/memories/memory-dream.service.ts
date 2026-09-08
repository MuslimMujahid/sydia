import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Memory, MemoryDreamSegment } from '../../database/entities';
import {
  CONVERSATION_REPOSITORY,
  USER_REPOSITORY,
  type IConversationRepository,
  type IUserRepository,
} from '../../database/interfaces';
import {
  LANGUAGE_MODEL,
  type LanguageModelGateway,
} from '../../infra/model-gateway';
import { MemoryService } from './memory.service';

const DREAMER_VERSION = 'incremental-dream-v1';
const DEFAULT_MIN_USER_MESSAGES = 4;
const DEFAULT_MIN_TOKENS = 800;

type Candidate = {
  content: string;
  category?: string;
  confidence: number;
  sourceMessageIds: string[];
};

type Consolidation = {
  action: 'ignore' | 'create' | 'merge' | 'supersede' | 'conflict';
  targetId?: string;
  content?: string;
};

export type DreamResult =
  | { status: 'skipped' | 'deferred' }
  | { status: 'completed'; candidateCount: number; mutationCount: number };

@Injectable()
export class MemoryDreamService {
  private readonly minUserMessages: number;
  private readonly minTokens: number;

  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(LANGUAGE_MODEL) private readonly model: LanguageModelGateway,
    private readonly memories: MemoryService,
    config: ConfigService,
  ) {
    this.minUserMessages = config.get<number>(
      'BACKEND_MEMORY_DREAM_MIN_USER_MESSAGES',
      DEFAULT_MIN_USER_MESSAGES,
    );
    this.minTokens = config.get<number>(
      'BACKEND_MEMORY_DREAM_MIN_TOKENS',
      DEFAULT_MIN_TOKENS,
    );
  }

  async run(
    userId: string,
    conversationId: string,
    throughMessageId: string,
    allowShortSegment = false,
  ): Promise<DreamResult> {
    const user = await this.users.findById(userId);
    if (!user?.automaticMemoryEnabled) return { status: 'skipped' };

    const segment = await this.conversations.findMemoryDreamSegment(
      userId,
      conversationId,
      throughMessageId,
    );

    if (!segment) return { status: 'skipped' };

    const userMessages = segment.messages.filter(({ role }) => role === 'user');
    const estimatedTokens = Math.ceil(
      segment.messages.reduce(
        (total, { content }) => total + content.length,
        0,
      ) / 4,
    );

    const eligible =
      userMessages.length >= this.minUserMessages ||
      estimatedTokens >= this.minTokens ||
      (allowShortSegment && userMessages.length >= 2);

    if (!eligible) return { status: 'deferred' };

    const run = await this.conversations.beginMemoryDream(
      segment,
      DREAMER_VERSION,
    );

    if (!run) return { status: 'skipped' };

    try {
      const candidates = await this.extractCandidates(segment);
      let mutationCount = 0;

      for (const [index, candidate] of candidates.entries()) {
        if (await this.applyCandidate(userId, run.id, index, candidate)) {
          mutationCount += 1;
        }
      }

      const completed = await this.conversations.completeMemoryDream(
        run.id,
        segment,
        candidates.length,
        mutationCount,
      );

      if (!completed) throw new Error('Memory dream checkpoint changed.');

      return {
        status: 'completed',
        candidateCount: candidates.length,
        mutationCount,
      };
    } catch (error) {
      await this.conversations.failMemoryDream(
        run.id,
        error instanceof Error ? error.message : 'Unknown memory dream failure',
      );
      throw error;
    }
  }

  private async extractCandidates(
    segment: MemoryDreamSegment,
  ): Promise<Candidate[]> {
    const result = await this.model.generate({
      messages: [
        {
          role: 'system',
          content:
            'Ekstrak hanya fakta, preferensi, keputusan, tujuan, rutinitas, atau batasan pengguna yang tahan lama dan berguna lintas percakapan. Pesan asisten hanya konteks dan tidak boleh menjadi bukti tanpa konfirmasi pengguna. Abaikan tugas sesaat, debugging sementara, pengetahuan umum, rahasia, kredensial, dan data sensitif kecuali pengguna meminta eksplisit untuk mengingatnya. Balas JSON {"candidates":[{"content":"fakta mandiri","category":"...","confidence":0..1,"sourceMessageIds":["..."]}]}. Gunakan hanya ID pesan user dari input.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            messages: segment.messages.map(({ id, role, content }) => ({
              id,
              role,
              content,
            })),
          }),
        },
      ],
    });

    return this.parseCandidates(result.text, segment);
  }

  private parseCandidates(
    value: string,
    segment: MemoryDreamSegment,
  ): Candidate[] {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return [];

    try {
      const parsed: unknown = JSON.parse(match[0]);
      if (!parsed || typeof parsed !== 'object') return [];
      const values = (parsed as Record<string, unknown>).candidates;
      if (!Array.isArray(values)) return [];
      const userMessageIds = new Set(
        segment.messages
          .filter(({ role }) => role === 'user')
          .map(({ id }) => id),
      );

      return values.slice(0, 20).flatMap((value): Candidate[] => {
        if (!value || typeof value !== 'object') return [];
        const record = value as Record<string, unknown>;
        const content =
          typeof record.content === 'string' ? record.content.trim() : '';

        const confidence =
          typeof record.confidence === 'number' ? record.confidence : 0;

        const sourceMessageIds = Array.isArray(record.sourceMessageIds)
          ? record.sourceMessageIds.filter(
              (id): id is string =>
                typeof id === 'string' && userMessageIds.has(id),
            )
          : [];

        if (!content || confidence < 0.85 || sourceMessageIds.length === 0) {
          return [];
        }

        return [
          {
            content,
            confidence,
            sourceMessageIds: [...new Set(sourceMessageIds)],
            category:
              typeof record.category === 'string'
                ? record.category.trim()
                : undefined,
          },
        ];
      });
    } catch {
      return [];
    }
  }

  private async applyCandidate(
    userId: string,
    dreamRunId: string,
    _index: number,
    candidate: Candidate,
  ): Promise<boolean> {
    const existing = await this.memories.search(userId, candidate.content, 5);
    const sourceKey = createHash('sha256')
      .update(
        `${DREAMER_VERSION}\0${[...candidate.sourceMessageIds].sort().join('\0')}\0${candidate.content.toLocaleLowerCase()}`,
      )
      .digest('hex');

    if (await this.memories.findBySourceKey(userId, sourceKey)) return false;
    const exact = existing.find(
      ({ content }) =>
        content.toLocaleLowerCase() === candidate.content.toLocaleLowerCase(),
    );

    if (exact) return false;

    const consolidation = await this.consolidate(candidate.content, existing);

    if (
      consolidation.action === 'ignore' ||
      consolidation.action === 'conflict'
    ) {
      return false;
    }

    const target = consolidation.targetId
      ? existing.find(({ id }) => id === consolidation.targetId)
      : undefined;

    const content = consolidation.content?.trim() || candidate.content;
    const sourceMessageId = candidate.sourceMessageIds.at(-1) ?? null;
    const input = {
      content,
      category: candidate.category ?? target?.category ?? null,
      confidence: candidate.confidence,
      sourceType: 'automatic' as const,
      sourceMessageId,
      extractorVersion: DREAMER_VERSION,
      sourceMessageIds: [
        ...new Set([
          ...(target?.sourceMessageIds ?? []),
          ...candidate.sourceMessageIds,
        ]),
      ],
      dreamRunId,
      sourceKey,
    };

    if (
      target &&
      (consolidation.action === 'merge' || consolidation.action === 'supersede')
    ) {
      return (
        (await this.memories.consolidate(userId, target.id, input)) !== null
      );
    }

    await this.memories.create(userId, input);

    return true;
  }

  private async consolidate(
    candidate: string,
    existing: Memory[],
  ): Promise<Consolidation> {
    if (existing.length === 0) return { action: 'create' };
    const result = await this.model.generate({
      messages: [
        {
          role: 'system',
          content:
            'Bandingkan fakta baru dengan memori aktif. Balas JSON tunggal dengan action ignore, create, merge, supersede, atau conflict. ignore untuk duplikat; merge untuk fakta kompatibel; supersede hanya bila fakta baru jelas mengganti fakta lama; conflict bila bertentangan tetapi kebenarannya tidak jelas. merge/supersede wajib menyertakan targetId dan content final mandiri. Jangan menambah fakta.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            candidate,
            existing: existing.map(({ id, content }) => ({ id, content })),
          }),
        },
      ],
    });

    return this.parseConsolidation(result.text, existing);
  }

  private parseConsolidation(value: string, existing: Memory[]): Consolidation {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return { action: 'conflict' };

    try {
      const parsed: unknown = JSON.parse(match[0]);
      if (!parsed || typeof parsed !== 'object') return { action: 'conflict' };
      const record = parsed as Record<string, unknown>;
      const action = record.action;

      if (
        action !== 'ignore' &&
        action !== 'create' &&
        action !== 'merge' &&
        action !== 'supersede' &&
        action !== 'conflict'
      ) {
        return { action: 'conflict' };
      }

      const targetId =
        typeof record.targetId === 'string' &&
        existing.some(({ id }) => id === record.targetId)
          ? record.targetId
          : undefined;

      const content =
        typeof record.content === 'string' ? record.content.trim() : undefined;

      if (
        (action === 'merge' || action === 'supersede') &&
        (!targetId || !content)
      ) {
        return { action: 'conflict' };
      }

      return { action, targetId, content };
    } catch {
      return { action: 'conflict' };
    }
  }
}

export { DREAMER_VERSION };
