import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HINDSIGHT_REPOSITORY,
  USER_REPOSITORY,
  type IHindsightRepository,
  type IUserRepository,
} from '../../database/interfaces';
import { QueueService } from '../../infra/queue';
import { MemoryEngineService } from './memory-engine.service';
import {
  MemoryPolicyService,
  MEMORY_POLICY_VERSION,
} from './memory-policy.service';
import { containsMemoryCredential, memoryChecksum } from './memory-admission';

export type MemoryIngestionResult = {
  status: 'skipped' | 'deferred' | 'queued' | 'completed';
  sourceCount?: number;
};

/** One bounded immutable document per user message; assistant echoes never enter extraction. */
@Injectable()
export class HindsightIngestionService {
  private readonly logger = new Logger(HindsightIngestionService.name);
  private readonly minUserMessages: number;
  private readonly minTokens: number;
  private readonly idleMs: number;
  private readonly shortAgeMs: number;
  constructor(
    @Inject(HINDSIGHT_REPOSITORY) private readonly ledger: IHindsightRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly policy: MemoryPolicyService,
    private readonly engine: MemoryEngineService,
    private readonly queues: QueueService,
    config: ConfigService,
  ) {
    this.minUserMessages = config.get<number>(
      'BACKEND_MEMORY_DREAM_MIN_USER_MESSAGES',
      4,
    );
    this.minTokens = config.get<number>('BACKEND_MEMORY_DREAM_MIN_TOKENS', 800);
    this.idleMs = config.get<number>(
      'BACKEND_MEMORY_DREAM_IDLE_MS',
      15 * 60_000,
    );
    this.shortAgeMs = config.get<number>(
      'BACKEND_MEMORY_DREAM_SHORT_SEGMENT_AGE_MS',
      6 * 60 * 60_000,
    );
  }

  async run(
    userId: string,
    conversationId: string,
    throughMessageId: string,
    allowShortSegment = false,
  ): Promise<MemoryIngestionResult> {
    const mode = this.engine.modeFor(userId);
    if (mode === 'legacy' || !this.engine.ingestionEnabled)
      return { status: 'skipped' };
    const user = await this.users.findById(userId);
    if (!user?.automaticMemoryEnabled) return { status: 'skipped' };
    const shadow = mode === 'shadow';
    const namespace = shadow
      ? this.engine.shadowNamespace()
      : this.engine.namespace;

    const segment = await this.ledger.ingestionSegment(
      userId,
      namespace,
      MEMORY_POLICY_VERSION,
      conversationId,
      throughMessageId,
    );

    if (!segment) return { status: 'skipped' };
    if (segment.checkpoint.pendingMessageId)
      return {
        status: (await this.ledger.completeCheckpoint(
          userId,
          segment.checkpoint.id,
        ))
          ? 'completed'
          : 'queued',
        sourceCount: segment.checkpoint.pendingSourceIds.length,
      };
    const estimatedTokens = Math.ceil(
      segment.messages.reduce((sum, { content }) => sum + content.length, 0) /
        4,
    );

    if (
      segment.messages.length < this.minUserMessages &&
      estimatedTokens < this.minTokens &&
      !(allowShortSegment && segment.messages.length >= 2)
    )
      return { status: 'deferred' };
    const bank = await this.ledger.ensureBank(
      userId,
      namespace,
      this.engine.bankId(userId, shadow),
    );

    if (!bank) return { status: 'skipped' };
    const ids = segment.messages.map(({ id }) => id);
    const excluded = new Set(
      (
        await Promise.all([
          this.ledger.suppressedMessageIds(userId, ids),
          this.ledger.explicitSourceMessageIds(userId, ids),
        ])
      ).flat(),
    );

    const sourceIds: string[] = [];

    for (const message of segment.messages) {
      if (
        excluded.has(message.id) ||
        containsMemoryCredential(message.content) ||
        message.content.length > 8000
      )
        continue;
      const sourceKey = `automatic:${MEMORY_POLICY_VERSION}:${message.id}`;
      const existing = await this.ledger.findSource(userId, bank.id, sourceKey);

      if (existing) {
        sourceIds.push(existing.source.id);
        continue;
      }

      const review = await this.policy.approveEvidence(userId, message.content);
      if (!review.spans.length) continue;
      const content = JSON.stringify({
        sydiaSource: 1,
        policyVersion: MEMORY_POLICY_VERSION,
        userEvidence: review.spans.map(({ quote }) => quote).join('\n'),
        approvedEvidence: review.spans.map(({ quote }) => quote),
        permissionQuotes: review.spans.flatMap(({ permissionQuote }) =>
          permissionQuote ? [permissionQuote] : [],
        ),
        role: 'user',
        userMessageId: message.id,
        eventAt: message.createdAt.toISOString(),
        userTimezone: user.timezone,
      });

      const result = await this.ledger.enqueue({
        userId,
        bankId: bank.id,
        sourceKey,
        kind: 'automatic',
        content,
        checksum: memoryChecksum(content),
        sourceMessageIds: [message.id],
        conversationId,
        eventAt: message.createdAt,
      });

      if ('snapshot' in result) sourceIds.push(result.snapshot.source.id);
      else if (result.status === 'unavailable') return { status: 'skipped' };
      else if (result.status === 'stale') {
        const concurrent = await this.ledger.findSource(
          userId,
          bank.id,
          sourceKey,
        );

        if (concurrent) sourceIds.push(concurrent.source.id);
        else return { status: 'deferred' };
      }
    }

    if (!(await this.ledger.stageCheckpoint(segment, sourceIds)))
      return { status: 'deferred' };
    const completed = await this.ledger.completeCheckpoint(
      userId,
      segment.checkpoint.id,
    );

    if (!completed) {
      try {
        await this.queues.memoryDeliveries.add('deliver', {
          kind: 'bank',
          bankId: bank.id,
        });
      } catch {
        this.logger.warn(
          'Automatic memory delivery queued durably; Redis publication unavailable.',
        );
      }
    }

    this.logger.debug(
      `Memory ingestion namespace=${shadow ? 'shadow' : 'active'} messages=${segment.messages.length} sources=${sourceIds.length} status=${completed ? 'completed' : 'queued'}`,
    );

    return {
      status: completed ? 'completed' : 'queued',
      sourceCount: sourceIds.length,
    };
  }

  async recover(): Promise<number> {
    const mode = this.engine.configuredMode();
    if (mode === 'legacy' || !this.engine.ingestionEnabled) return 0;
    const namespace =
      mode === 'shadow' ? this.engine.shadowNamespace() : this.engine.namespace;

    const pending = await this.ledger.pendingCheckpoints(namespace, 20);
    let completed = 0;
    for (const checkpoint of pending)
      if (
        await this.ledger.completeCheckpoint(checkpoint.userId, checkpoint.id)
      )
        completed += 1;
    const ready = await this.ledger.recoverableIngestion(
      namespace,
      MEMORY_POLICY_VERSION,
      new Date(Date.now() - this.idleMs),
      this.engine.cohortUserIds(),
      20,
    );

    for (const candidate of ready) {
      const result = await this.run(
        candidate.userId,
        candidate.conversationId,
        candidate.throughMessageId,
        candidate.lastMessageAt.getTime() <= Date.now() - this.shortAgeMs,
      );

      if (result.status === 'completed') completed += 1;
    }

    return completed;
  }
}
