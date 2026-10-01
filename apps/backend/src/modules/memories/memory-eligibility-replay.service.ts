import { Inject, Injectable } from '@nestjs/common';
import {
  CONVERSATION_REPOSITORY,
  HINDSIGHT_REPOSITORY,
  USER_REPOSITORY,
  type IConversationRepository,
  type IHindsightRepository,
  type IUserRepository,
} from '../../database/interfaces';
import { QueueService } from '../../infra/queue';
import { containsMemoryCredential, memoryChecksum } from './memory-admission';
import { MemoryEngineService } from './memory-engine.service';
import {
  MemoryPolicyService,
  MEMORY_POLICY_VERSION,
} from './memory-policy.service';

export type EligibilityReplayRow = {
  messageId: string;
  status:
    | 'excluded'
    | 'existing'
    | 'ineligible'
    | 'eligible'
    | 'queued'
    | 'unavailable';
};

/** Bounded recovery of classifier negatives; never rewinds a checkpoint or
 * clears suppression. Dry-run is the default and performs no ledger writes. */
@Injectable()
export class MemoryEligibilityReplayService {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    @Inject(HINDSIGHT_REPOSITORY) private readonly ledger: IHindsightRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly policy: MemoryPolicyService,
    private readonly engine: MemoryEngineService,
    private readonly queues: QueueService,
  ) {}

  async replay(
    userId: string,
    messageIds: readonly string[],
    apply = false,
  ): Promise<EligibilityReplayRow[]> {
    if (
      !messageIds.length ||
      messageIds.length > 24 ||
      new Set(messageIds).size !== messageIds.length
    )
      throw new Error('Eligibility replay requires 1–24 distinct message IDs');
    const mode = this.engine.modeFor(userId);
    const user = await this.users.findById(userId);
    if (
      mode === 'legacy' ||
      !this.engine.ingestionEnabled ||
      !user?.automaticMemoryEnabled
    )
      return messageIds.map((messageId) => ({ messageId, status: 'excluded' }));
    const shadow = mode === 'shadow';
    const namespace = shadow
      ? this.engine.shadowNamespace()
      : this.engine.namespace;

    const bank = apply
      ? await this.ledger.ensureBank(
          userId,
          namespace,
          this.engine.bankId(userId, shadow),
        )
      : await this.ledger.findBank(userId, namespace);

    const rows: EligibilityReplayRow[] = [];
    let queued = false;

    for (const messageId of messageIds) {
      const message = await this.conversations.findUserMemoryEvidence(
        userId,
        messageId,
      );

      const excluded = [
        ...(await this.ledger.suppressedMessageIds(userId, [messageId])),
        ...(await this.ledger.explicitSourceMessageIds(userId, [messageId])),
      ];

      if (
        !message ||
        excluded.includes(messageId) ||
        containsMemoryCredential(message.content) ||
        message.content.length > 8000
      ) {
        rows.push({ messageId, status: 'excluded' });
        continue;
      }

      const sourceKey = `automatic:${MEMORY_POLICY_VERSION}:${messageId}`;

      if (bank && (await this.ledger.findSource(userId, bank.id, sourceKey))) {
        rows.push({ messageId, status: 'existing' });
        continue;
      }

      // Bypass the eligibility classifier to recover its false negatives, while
      // retaining the authoritative quotation and sensitivity admission policy.
      const review = await this.policy.approveEvidence(userId, message.content);

      if (!review.spans.length) {
        rows.push({ messageId, status: 'ineligible' });
        continue;
      }

      if (!apply) {
        rows.push({ messageId, status: 'eligible' });
        continue;
      }

      const currentUser = await this.users.findById(userId);
      const suppressed = await this.ledger.suppressedMessageIds(userId, [
        messageId,
      ]);

      const explicit = await this.ledger.explicitSourceMessageIds(userId, [
        messageId,
      ]);

      if (
        !bank ||
        !currentUser?.automaticMemoryEnabled ||
        !this.engine.ingestionEnabled ||
        suppressed.length ||
        explicit.length
      ) {
        rows.push({ messageId, status: 'excluded' });
        continue;
      }

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
        userTimezone: currentUser.timezone,
      });

      const result = await this.ledger.enqueue({
        userId,
        bankId: bank.id,
        sourceKey,
        kind: 'automatic',
        content,
        checksum: memoryChecksum(content),
        sourceMessageIds: [messageId],
        conversationId: message.conversationId,
        eventAt: message.createdAt,
      });

      if ('snapshot' in result) {
        queued = true;
        rows.push({ messageId, status: 'queued' });
      } else rows.push({ messageId, status: 'unavailable' });
    }

    if (queued && bank) {
      try {
        await this.queues.memoryDeliveries.add('deliver', {
          kind: 'bank',
          bankId: bank.id,
        });
      } catch {
        /* durable delivery recovery republishes; no checkpoint mutation */
      }
    }

    return rows;
  }
}
