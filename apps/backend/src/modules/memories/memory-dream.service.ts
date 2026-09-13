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

type PreparedCandidate = {
  index: number;
  candidate: Candidate;
  sourceKey: string;
  existing: Memory[];
};

function candidateSourceKey(candidate: Candidate): string {
  return createHash('sha256')
    .update(
      `${DREAMER_VERSION}\0${[...candidate.sourceMessageIds].sort().join('\0')}\0${candidate.content.toLocaleLowerCase()}`,
    )
    .digest('hex');
}

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
      const candidates = await this.extractCandidates(segment, run.id);
      const prepared = await this.prepareCandidates(userId, candidates);
      const decisions = await this.consolidateBatch(
        userId,
        segment.conversationId,
        run.id,
        prepared,
      );

      let mutationCount = 0;

      for (const item of prepared) {
        const applied = await this.applyDecision(
          userId,
          run.id,
          item,
          decisions.get(item.index),
        );

        if (applied) {
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
    runId: string,
  ): Promise<Candidate[]> {
    const result = await this.model.generate({
      userId: segment.userId,
      conversationId: segment.conversationId,
      runId,
      messages: [
        {
          role: 'system',
          content:
            'Extract only durable and useful user facts, preferences, decisions, goals, routines, or constraints that carry across conversations. Assistant messages are context only and must not be treated as evidence without user confirmation. Ignore temporary tasks, short-lived debugging, general knowledge, secrets, credentials, and sensitive data unless the user explicitly asks you to remember it. Reply with JSON {"candidates":[{"content":"standalone fact","category":"...","confidence":0..1,"sourceMessageIds":["..."]}]}. Use only user message IDs from the input.',
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

  /**
   * Drops anything already stored before it reaches the model or the embedding
   * service: the cheap source-key lookup and the exact-content check run first,
   * so duplicates never pay for a vector search or a consolidation call.
   */
  private async prepareCandidates(
    userId: string,
    candidates: Candidate[],
  ): Promise<PreparedCandidate[]> {
    const prepared: PreparedCandidate[] = [];

    for (const [index, candidate] of candidates.entries()) {
      const sourceKey = candidateSourceKey(candidate);

      if (await this.memories.findBySourceKey(userId, sourceKey)) continue;

      const existing = await this.memories.search(userId, candidate.content, 5);

      const duplicate = existing.some(
        ({ content }) =>
          content.toLocaleLowerCase() === candidate.content.toLocaleLowerCase(),
      );

      if (duplicate) continue;

      prepared.push({ index, candidate, sourceKey, existing });
    }

    return prepared;
  }

  /**
   * Resolves every candidate against its existing memories in one model call
   * instead of one call per candidate. Candidates with no matches are created
   * directly and never reach the model.
   */
  private async consolidateBatch(
    userId: string,
    conversationId: string,
    runId: string,
    prepared: PreparedCandidate[],
  ): Promise<Map<number, Consolidation>> {
    const decisions = new Map<number, Consolidation>();
    const pending = prepared.filter((item) => item.existing.length > 0);

    for (const item of prepared) {
      if (item.existing.length === 0) {
        decisions.set(item.index, { action: 'create' });
      }
    }

    if (pending.length === 0) return decisions;

    const result = await this.model.generate({
      userId,
      conversationId,
      runId,
      messages: [
        {
          role: 'system',
          content:
            'Compare each new fact with its active memories. Reply with a single JSON object {"decisions":[{"index":number,"action":"ignore|create|merge|supersede|conflict","targetId":string,"content":string}]} containing one decision per input item, keyed by its index. Use ignore for duplicates; merge for compatible facts; supersede only when the new fact clearly replaces an old fact; conflict when they contradict each other but the truth is unclear. merge and supersede must include targetId, which must be one of the supplied memory ids, and standalone final content. Do not add facts.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            items: pending.map(({ index, candidate, existing }) => ({
              index,
              candidate: candidate.content,
              existing: existing.map(({ id, content }) => ({ id, content })),
            })),
          }),
        },
      ],
    });

    for (const [index, decision] of this.parseBatchConsolidation(
      result.text,
      pending,
    )) {
      decisions.set(index, decision);
    }

    return decisions;
  }

  private parseBatchConsolidation(
    value: string,
    pending: PreparedCandidate[],
  ): Map<number, Consolidation> {
    const decisions = new Map<number, Consolidation>();
    const conflict = (): Consolidation => ({ action: 'conflict' });
    const match = value.match(/\{[\s\S]*\}/);
    const entries = match ? this.decisionEntries(match[0]) : null;

    for (const item of pending) {
      const entry = entries?.get(item.index);
      decisions.set(
        item.index,
        entry ? this.validateConsolidation(entry, item.existing) : conflict(),
      );
    }

    return decisions;
  }

  private decisionEntries(
    value: string,
  ): Map<number, Record<string, unknown>> | null {
    try {
      const parsed: unknown = JSON.parse(value);

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }

      const list = (parsed as Record<string, unknown>).decisions;
      if (!Array.isArray(list)) return null;
      const entries = new Map<number, Record<string, unknown>>();

      for (const entry of list) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          continue;
        }

        const index = (entry as Record<string, unknown>).index;

        if (typeof index === 'number' && Number.isInteger(index)) {
          entries.set(index, entry as Record<string, unknown>);
        }
      }

      return entries;
    } catch {
      return null;
    }
  }

  private validateConsolidation(
    record: Record<string, unknown>,
    existing: Memory[],
  ): Consolidation {
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
  }

  private async applyDecision(
    userId: string,
    dreamRunId: string,
    item: PreparedCandidate,
    decision: Consolidation | undefined,
  ): Promise<boolean> {
    if (
      !decision ||
      decision.action === 'ignore' ||
      decision.action === 'conflict'
    ) {
      return false;
    }

    const { candidate, existing, sourceKey } = item;
    const target = decision.targetId
      ? existing.find(({ id }) => id === decision.targetId)
      : undefined;

    const content = decision.content?.trim() || candidate.content;
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
      (decision.action === 'merge' || decision.action === 'supersede')
    ) {
      return (
        (await this.memories.consolidate(userId, target.id, input)) !== null
      );
    }

    await this.memories.create(userId, input);

    return true;
  }
}

export { DREAMER_VERSION };
