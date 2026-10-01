import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  CONVERSATION_REPOSITORY,
  MEMORY_REPOSITORY,
  HINDSIGHT_REPOSITORY,
  USER_REPOSITORY,
  type IConversationRepository,
  type IMemoryRepository,
  type IHindsightRepository,
  type IUserRepository,
  type EnqueueMemorySource,
} from '../../database/interfaces';
import type {
  Memory,
  MemoryWrite,
  MemorySourceSnapshot,
  ResolvedMemoryReference,
} from '../../database/entities';
import {
  HINDSIGHT_GATEWAY,
  type HindsightGateway,
  type HindsightFact,
} from '../../infra/hindsight';
import { QueueService } from '../../infra/queue';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { MemoryService } from './memory.service';
import { MemoryEngineService } from './memory-engine.service';
import { canonicalMemorySubject } from './memory-subject';
import { containsMemoryCredential, memoryChecksum } from './memory-admission';
import type {
  MemorySearchHit,
  MemoryMutationReceipt,
  MemoryWriteContext,
} from './memory-access.types';
import { MemoryPolicyService } from './memory-policy.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_REFERENCES = 8;
type ResolvedTarget = {
  snapshot: MemorySourceSnapshot;
  factIds: Set<string> | null;
};

function fail(message: string, status = HttpStatus.CONFLICT): ApiException {
  const exception = new ApiException({
    code:
      status === HttpStatus.BAD_REQUEST
        ? ErrorCodes.BAD_REQUEST
        : status === HttpStatus.SERVICE_UNAVAILABLE
          ? ErrorCodes.SERVICE_UNAVAILABLE
          : ErrorCodes.CONFLICT,
    message,
    status,
  });

  exception.message = message;

  return exception;
}

/** Chat-facing engine adapter; debug CRUD does not define this contract. */
@Injectable()
export class MemoryAccessService {
  private readonly logger = new Logger(MemoryAccessService.name);

  constructor(
    private readonly engine: MemoryEngineService,
    private readonly legacy: MemoryService,
    @Inject(MEMORY_REPOSITORY) private readonly memories: IMemoryRepository,
    @Inject(HINDSIGHT_REPOSITORY) private readonly ledger: IHindsightRepository,
    @Inject(HINDSIGHT_GATEWAY) private readonly gateway: HindsightGateway,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    private readonly queues: QueueService,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Optional() private readonly policy?: MemoryPolicyService,
  ) {}

  async create(
    userId: string,
    input: MemoryWrite,
    context: MemoryWriteContext,
  ): Promise<Memory | MemoryMutationReceipt> {
    const content = this.validContent(input.content);
    const requestKey = this.requestKey(context, 'save');
    const requestFingerprint = memoryChecksum(
      JSON.stringify({
        content,
        sourceMessageId: context.sourceMessageId ?? null,
      }),
    );

    if (this.engine.modeFor(userId) !== 'hindsight') {
      const retired = await this.ledger.findBank(userId, this.engine.namespace);

      if (
        retired &&
        retired.state !== 'active' &&
        (await this.users.findById(userId))
      ) {
        const replay = await this.ledger.findMutation(
          userId,
          retired.id,
          requestKey,
        );

        if (replay.length)
          return this.replayed(replay, requestKey, requestFingerprint);
      }

      return this.legacy.create(userId, input);
    }

    const bank = await this.ledger.ensureBank(
      userId,
      this.engine.namespace,
      this.engine.bankId(userId),
    );

    if (!bank) {
      const retired = await this.ledger.findBank(userId, this.engine.namespace);

      if (retired && (await this.users.findById(userId))) {
        const replay = await this.ledger.findMutation(
          userId,
          retired.id,
          requestKey,
        );

        if (replay.length)
          return this.replayed(replay, requestKey, requestFingerprint);
      }

      throw fail(
        'Memory storage is unavailable for this account.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const replay = await this.ledger.findMutation(userId, bank.id, requestKey);
    if (replay.length)
      return this.replayed(replay, requestKey, requestFingerprint);
    const userEvidence = await this.evidence(
      userId,
      context.sourceMessageId,
      content,
    );

    const { sourceMessageIds, ...approved } = await this.approvedEvidence(
      userId,
      userEvidence.content,
      userEvidence.requestedFact,
      userEvidence.messages,
      context.sourceMessageId,
    );

    const sourceInput = JSON.stringify({
      sydiaSource: 1,
      ...approved,
      userTimezone: userEvidence.timezone,
      requestedFact: userEvidence.requestedFact,
      categoryHint: input.category ?? null,
    });

    const result = await this.ledger.enqueue({
      userId,
      bankId: bank.id,
      sourceKey: `explicit:${requestKey}`,
      kind: 'explicit',
      content: sourceInput,
      checksum: memoryChecksum(sourceInput),
      requestKey,
      requestFingerprint,
      sourceMessageIds,
      conversationId: userEvidence.conversationId,
      eventAt: userEvidence.eventAt,
    });

    if (!('snapshot' in result))
      throw fail(
        `Memory request was ${result.status}; no remote save was confirmed.`,
      );
    await this.wake(bank.id);

    return this.receipt([result.snapshot], requestKey);
  }

  async update(
    userId: string,
    id: string,
    input: Partial<MemoryWrite>,
    context: MemoryWriteContext,
  ): Promise<Memory | MemoryMutationReceipt | null> {
    const requestedId = id;

    if (!id.startsWith('hm:') && !id.startsWith('hs:')) {
      if (this.engine.modeFor(userId) !== 'hindsight') {
        if (!context.sourceMessageId)
          return this.legacy.update(userId, id, input);
        const evidence = await this.conversations.findUserMemoryEvidence(
          userId,
          context.sourceMessageId,
        );

        if (!evidence)
          throw fail(
            'A user-owned message is required for this memory correction.',
            HttpStatus.BAD_REQUEST,
          );
        const current = await this.memories.findById(userId, id);
        if (!current) return null;

        return this.legacy.update(userId, id, {
          ...input,
          sourceMessageId: context.sourceMessageId,
          sourceMessageIds: [
            ...new Set([
              ...current.sourceMessageIds,
              ...(current.source.messageId ? [current.source.messageId] : []),
              context.sourceMessageId,
            ]),
          ],
        });
      }

      id = await this.importedReference(userId, id);
    }

    const content = this.validContent(input.content ?? '');
    const bank = await this.ledger.findBank(userId, this.engine.namespace);
    if (!bank || !(await this.users.findById(userId)))
      throw fail('Memory reference is no longer available. Search again.');
    const requestKey = this.requestKey(context, 'correct');
    const requestFingerprint = memoryChecksum(
      JSON.stringify({
        id: requestedId,
        content,
        sourceMessageId: context.sourceMessageId ?? null,
      }),
    );

    const replay = await this.ledger.findMutation(userId, bank.id, requestKey);
    if (replay.length)
      return this.replayed(replay, requestKey, requestFingerprint);
    if (bank.state !== 'active')
      throw fail('Memory reference is no longer available. Search again.');
    const userEvidence = await this.evidence(
      userId,
      context.sourceMessageId,
      content,
    );

    const targets = await this.targets(userId, id);
    const inputs: EnqueueMemorySource[] = [];
    const { sourceMessageIds, ...approved } = await this.approvedEvidence(
      userId,
      userEvidence.content,
      userEvidence.requestedFact,
      userEvidence.messages,
      context.sourceMessageId,
    );

    for (const { snapshot, factIds } of targets) {
      if (snapshot.source.state !== 'active')
        throw fail('Memory was forgotten. Search again.');
      const facts = factIds ? await this.facts(snapshot) : [];
      if (
        factIds &&
        [...factIds].some((id) => !facts.some((fact) => fact.id === id))
      )
        throw fail(
          'Memory facts changed. Search again before correcting them.',
        );
      const preservedFacts = facts
        .filter(({ id }) => !factIds?.has(id))
        .map(({ text, occurredStart, mentionedAt }) => ({
          text,
          occurredAt:
            occurredStart ??
            mentionedAt ??
            snapshot.source.eventAt.toISOString(),
        }));

      const sourceInput = JSON.stringify({
        sydiaSource: 1,
        ...approved,
        permissionQuotes: [
          ...new Set([
            ...(approved.permissionQuotes ?? []),
            ...(preservedFacts.length
              ? this.preservedPermissions(snapshot)
              : []),
          ]),
        ],
        userTimezone: userEvidence.timezone,
        requestedFact: userEvidence.requestedFact,
        preservedFacts,
      });

      if (containsMemoryCredential(sourceInput))
        throw fail(
          'Credential material cannot be saved as memory.',
          HttpStatus.BAD_REQUEST,
        );
      inputs.push({
        userId,
        bankId: bank.id,
        sourceKey: snapshot.source.sourceKey,
        kind: 'explicit',
        expectedGeneration: snapshot.source.generation,
        content: sourceInput,
        checksum: memoryChecksum(sourceInput),
        requestKey,
        requestFingerprint,
        sourceMessageIds: [
          ...snapshot.source.sourceMessageIds,
          ...sourceMessageIds,
        ],
        conversationId:
          userEvidence.conversationId ?? snapshot.source.conversationId,
        eventAt: userEvidence.eventAt,
      });
    }

    const result = await this.ledger.replaceSources(inputs);
    if (result.status !== 'written')
      throw fail(`Memory correction was ${result.status}. Search again.`);
    await this.wake(bank.id);

    return this.receipt(result.snapshots, requestKey);
  }

  async delete(
    userId: string,
    id: string,
    context?: MemoryWriteContext,
  ): Promise<MemoryMutationReceipt | null> {
    if (!id.startsWith('hm:') && !id.startsWith('hs:')) {
      if (this.engine.modeFor(userId) === 'hindsight')
        return this.delete(
          userId,
          await this.importedReference(userId, id),
          context,
        );
      if (!(await this.memories.delete(userId, id, context?.sourceMessageId)))
        return null;

      return {
        engine: 'legacy',
        status: 'completed',
        id,
        message: 'Memory forgotten.',
      };
    }

    const targets = await this.targets(userId, id, true);
    const result = await this.ledger.forgetSources(
      userId,
      targets.map(({ snapshot }) => ({
        sourceId: snapshot.source.id,
        generation: snapshot.source.generation,
      })),
      context?.sourceMessageId ? [context.sourceMessageId] : [],
    );

    if (result !== 'deleted')
      throw fail('Memory changed before forgetting. Search again.');
    const refreshed = await Promise.all(
      targets.map(({ snapshot }) =>
        this.ledger.snapshot(userId, snapshot.source.id),
      ),
    );

    const snapshots = refreshed.filter(
      (value): value is MemorySourceSnapshot => value !== null,
    );

    if (snapshots.length !== targets.length)
      throw fail(
        'Memory erasure state could not be verified.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    await this.wake(snapshots[0]!.bank.id);
    const completed = (await this.ledger.pendingErasureCount(userId)) === 0;

    return {
      engine: 'hindsight',
      status: completed ? 'completed' : 'queued',
      id,
      sourceIds: snapshots.map(({ source }) => source.id),
      message: completed
        ? 'Memory erased.'
        : 'This memory is no longer used. Permanent deletion is still processing.',
    };
  }

  async search(
    userId: string,
    query: string,
    limit = 5,
    options: { mutation?: boolean } = {},
  ): Promise<MemorySearchHit[]> {
    if (!query.trim()) return [];
    if (containsMemoryCredential(query))
      throw fail(
        'Credential material cannot be used for memory search.',
        HttpStatus.BAD_REQUEST,
      );
    if (this.engine.modeFor(userId) !== 'hindsight')
      return this.legacy.search(userId, query, limit);
    const bank = await this.ledger.findBank(userId, this.engine.namespace);
    if (!bank || bank.state !== 'active') return [];
    const boundedLimit = Math.max(1, Math.min(10, limit));
    const started = performance.now();

    try {
      const recalled = await this.gateway.recall(bank.id, {
        query: query.slice(0, 1_000),
        timestamp: new Date().toISOString(),
        maxTokens: this.engine.recallTokens,
        includeObservations: !options.mutation,
      });

      const rawFacts = [
        ...recalled.results.filter(({ type }) => type === 'world'),
        ...Object.values(recalled.sourceFacts),
      ];

      const references = await this.ledger.referencesForDocuments(
        userId,
        bank.id,
        [
          ...new Set(
            rawFacts.flatMap(({ documentId }) =>
              documentId ? [documentId] : [],
            ),
          ),
        ],
      );

      const indexed = new Map(
        references.map((reference) => [
          `${reference.delivery.documentId}\0${reference.reference.remoteFactId}`,
          reference,
        ]),
      );

      const validated = (
        fact: HindsightFact,
      ): ResolvedMemoryReference | undefined => {
        if (fact.type !== 'world' || !fact.documentId) return undefined;
        const reference = indexed.get(`${fact.documentId}\0${fact.id}`);
        if (!reference || !this.metadataMatches(fact, reference))
          return undefined;

        return reference;
      };

      const hits: MemorySearchHit[] = [];
      const seen = new Set<string>();

      for (const fact of recalled.results) {
        if (options.mutation && fact.type !== 'world') continue;
        const evidence =
          fact.type === 'world'
            ? [validated(fact)]
            : fact.type === 'observation' && fact.sourceFactIds.length
              ? fact.sourceFactIds.map((id) =>
                  recalled.sourceFacts[id]
                    ? validated(recalled.sourceFacts[id])
                    : undefined,
                )
              : [];

        if (
          !evidence.length ||
          evidence.some((item) => !item) ||
          evidence.length > MAX_REFERENCES
        )
          continue;
        const verified = evidence as ResolvedMemoryReference[];
        const ids = [
          ...new Set(verified.map(({ reference }) => reference.id)),
        ].sort();

        const id = `hm:${ids.join('.')}`;
        if (seen.has(id) || containsMemoryCredential(fact.text)) continue;
        seen.add(id);
        hits.push({
          id,
          content: fact.text,
          type: fact.type === 'observation' ? 'observation' : 'world',
          evidence: verified.map(({ reference, source, delivery }) => ({
            reference: `hm:${reference.id}`,
            content:
              rawFacts.find(
                ({ id, documentId }) =>
                  id === reference.remoteFactId &&
                  documentId === delivery.documentId,
              )?.text ?? '',
            sourceId: source.id,
            messageIds: source.sourceMessageIds,
            eventAt: source.eventAt.toISOString(),
          })),
        });
        if (hits.length >= boundedLimit) break;
      }

      this.logger.debug(
        `Memory recall engine=hindsight candidates=${recalled.results.length} admitted=${hits.length} durationMs=${Math.round(performance.now() - started)}`,
      );

      return hits;
    } catch {
      throw fail(
        'Memory search is temporarily unavailable. No verified results were returned.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private metadataMatches(
    fact: HindsightFact,
    snapshot: MemorySourceSnapshot & {
      delivery: ResolvedMemoryReference['delivery'];
    },
  ): boolean {
    return (
      fact.metadata.sourceId === snapshot.source.id &&
      fact.metadata.generation === String(snapshot.delivery.generation) &&
      fact.metadata.checksum === snapshot.delivery.checksum
    );
  }

  private async facts(
    snapshot: MemorySourceSnapshot,
  ): Promise<HindsightFact[]> {
    const current = snapshot.deliveries.find(
      ({ generation }) => generation === snapshot.source.generation,
    );

    if (!current || current.state !== 'admitted')
      throw fail(
        'Memory retention is still processing. Retry once it completes.',
      );
    const facts: HindsightFact[] = [];
    let total = 0;

    do {
      const page = await this.gateway.listFacts(
        snapshot.bank.id,
        current.documentId,
        facts.length,
      );

      if (
        page.total > 200 ||
        (facts.length && page.total !== total) ||
        (page.total > facts.length && !page.items.length)
      )
        throw fail(
          'Memory evidence changed or exceeds correction limits. Search again.',
        );
      total = page.total;
      facts.push(...page.items);
      if (
        facts.length > total ||
        new Set(facts.map(({ id }) => id)).size !== facts.length ||
        facts.some(
          (fact) =>
            !this.metadataMatches(fact, { ...snapshot, delivery: current }),
        )
      )
        throw fail('Memory evidence cannot be verified. Search again.');
    } while (facts.length < total);

    return facts;
  }

  private async targets(
    userId: string,
    id: string,
    forgetting = false,
  ): Promise<ResolvedTarget[]> {
    const parts = id.slice(3).split(id.startsWith('hm:') ? '.' : ',');
    if (!parts.length || parts.length > MAX_REFERENCES)
      throw fail('Invalid memory reference.', HttpStatus.BAD_REQUEST);
    const grouped = new Map<string, ResolvedTarget>();

    for (const part of parts) {
      let snapshot: MemorySourceSnapshot;
      let remoteFactId: string | null = null;
      let generation: number;
      if (id.startsWith('hm:')) {
        if (!UUID.test(part))
          throw fail('Invalid memory reference.', HttpStatus.BAD_REQUEST);
        const reference = await this.ledger.resolveReference(
          userId,
          part,
          true,
        );

        if (!reference) throw fail('Memory reference is stale. Search again.');
        snapshot = reference;
        generation = reference.delivery.generation;
        remoteFactId = reference.reference.remoteFactId;
      } else if (id.startsWith('hs:')) {
        const [sourceId, version, extra] = part.split(':');
        if (
          !sourceId ||
          !UUID.test(sourceId) ||
          !version ||
          extra ||
          !/^[1-9]\d*$/.test(version) ||
          !Number.isSafeInteger(Number(version))
        )
          throw fail('Invalid memory reference.', HttpStatus.BAD_REQUEST);
        const source = await this.ledger.snapshot(userId, sourceId);
        if (!source) throw fail('Memory reference is stale. Search again.');
        snapshot = source;
        generation = Number(version);
      } else throw fail('Invalid memory reference.', HttpStatus.BAD_REQUEST);
      if (
        (forgetting
          ? !this.engine.canForgetNamespace(
              snapshot.bank.namespace,
              snapshot.bank.state !== 'active',
            )
          : snapshot.bank.namespace !== this.engine.namespace) ||
        (snapshot.bank.state !== 'active' && !forgetting) ||
        (snapshot.source.generation !== generation &&
          !(forgetting && snapshot.source.state === 'deleted'))
      )
        throw fail('Memory reference is stale. Search again.');
      const target = grouped.get(snapshot.source.id) ?? {
        snapshot,
        factIds: remoteFactId ? new Set<string>() : null,
      };

      if (remoteFactId) target.factIds?.add(remoteFactId);
      grouped.set(snapshot.source.id, target);
    }

    return [...grouped.values()];
  }

  private validContent(value: string): string {
    const content = value.trim();
    if (!content || content.length > 8_000)
      throw fail(
        'Memory content must contain 1–8000 characters.',
        HttpStatus.BAD_REQUEST,
      );
    if (containsMemoryCredential(content))
      throw fail(
        'Credential material cannot be saved as memory. Use the secret vault.',
        HttpStatus.BAD_REQUEST,
      );

    return content;
  }

  private preservedPermissions(snapshot: MemorySourceSnapshot): string[] {
    const current = snapshot.deliveries.find(
      ({ generation, state }) =>
        generation === snapshot.source.generation && state === 'admitted',
    );

    if (!current?.content) return [];

    try {
      const source: unknown = JSON.parse(current.content);
      if (!source || typeof source !== 'object' || Array.isArray(source))
        return [];
      const envelope = source as Record<string, unknown>;

      return envelope.sydiaSource === 1 &&
        Array.isArray(envelope.permissionQuotes)
        ? envelope.permissionQuotes
            .filter((value): value is string => typeof value === 'string')
            .slice(0, 24)
        : [];
    } catch {
      return [];
    }
  }

  private async approvedEvidence(
    userId: string,
    userEvidence: string,
    requestedFact: string,
    messages: Array<{ id: string; content: string }>,
    requestMessageId?: string,
  ): Promise<{
    userEvidence: string;
    approvedEvidence?: string[];
    permissionQuotes?: string[];
    sourceMessageIds: string[];
    userMessageId?: string;
  }> {
    if (!this.policy)
      return { userEvidence, sourceMessageIds: messages.map(({ id }) => id) };

    try {
      const review = await this.policy.approveEvidence(userId, userEvidence, {
        messages: messages.length
          ? messages.map(({ content }) => content)
          : [userEvidence],
        requestedFact,
      });

      const approvedEvidence = review.spans.map(({ quote }) => quote);
      const permissionQuotes = review.spans.flatMap(({ permissionQuote }) =>
        permissionQuote ? [permissionQuote] : [],
      );

      const evidence = {
        userEvidence: approvedEvidence.join('\n'),
        userMessageId: requestMessageId,
        approvedEvidence,
        permissionQuotes,
      };

      const accepted =
        approvedEvidence.length &&
        (await this.policy.approveFacts(
          userId,
          JSON.stringify({ sydiaSource: 1, ...evidence }),
          [
            {
              id: 'requested',
              text: requestedFact,
              type: 'world',
              documentId: null,
              sourceFactIds: [],
              metadata: {},
              occurredStart: null,
              mentionedAt: null,
            },
          ],
        ));

      if (!accepted)
        throw fail(
          'This memory request is not supported by eligible user evidence.',
          HttpStatus.BAD_REQUEST,
        );

      return {
        ...evidence,
        sourceMessageIds: messages
          .filter(
            ({ id, content }) =>
              id === requestMessageId ||
              [...approvedEvidence, ...permissionQuotes].some((quote) =>
                content.includes(quote),
              ),
          )
          .map(({ id }) => id),
      };
    } catch (error: unknown) {
      if (error instanceof ApiException) throw error;
      throw fail(
        'Memory policy review is temporarily unavailable. No save was dispatched.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private async importedReference(
    userId: string,
    legacyId: string,
  ): Promise<string> {
    const bank = await this.ledger.findBank(userId, this.engine.namespace);
    const source = bank
      ? await this.ledger.findSource(userId, bank.id, `legacy:${legacyId}`)
      : null;

    if (!source)
      throw fail(
        'This legacy memory has not been migrated. Search again after backfill.',
      );

    return `hs:${source.source.id}:${source.source.generation}`;
  }

  private async evidence(
    userId: string,
    messageId: string | undefined,
    explicitContent: string,
  ): Promise<{
    content: string;
    conversationId: string | null;
    eventAt: Date;
    timezone: string;
    requestedFact: string;
    messages: Array<{ id: string; content: string }>;
  }> {
    const user = await this.users.findById(userId);
    if (!user)
      throw fail(
        'Memory owner no longer exists.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    if (!messageId)
      return {
        content: explicitContent,
        messages: [],
        conversationId: null,
        eventAt: new Date(),
        timezone: user.timezone,
        requestedFact: canonicalMemorySubject(explicitContent, user),
      };
    const message = await this.conversations.findUserMemoryEvidence(
      userId,
      messageId,
    );

    const content = message?.content;

    if (!content || content.length > 8000)
      throw fail(
        'A bounded user message is required as memory evidence.',
        HttpStatus.BAD_REQUEST,
      );
    if (containsMemoryCredential(content))
      throw fail(
        'Messages containing credential material cannot be sent to memory extraction.',
        HttpStatus.BAD_REQUEST,
      );

    const recent = await this.conversations.findUserMemoryEvidenceContext(
      userId,
      messageId,
    );

    if (!recent.some(({ id }) => id === messageId))
      throw fail(
        'A bounded user message is required as memory evidence.',
        HttpStatus.BAD_REQUEST,
      );
    const suppressed = new Set(
      await this.ledger.suppressedMessageIds(
        userId,
        recent.map(({ id }) => id),
      ),
    );

    if (suppressed.has(messageId))
      throw fail(
        'This message was forgotten and cannot be reused as memory evidence.',
        HttpStatus.BAD_REQUEST,
      );
    const messages: Array<{ id: string; content: string }> = [];
    let length = 0;

    for (const item of [...recent].reverse()) {
      if (
        suppressed.has(item.id) ||
        containsMemoryCredential(item.content) ||
        !item.content.trim()
      )
        continue;
      const cost = item.content.length + (messages.length ? 2 : 0);
      if (length + cost > 8000) continue;
      messages.unshift({ id: item.id, content: item.content });
      length += cost;
    }

    return {
      content: messages.map(({ content }) => content).join('\n\n'),
      messages,
      conversationId: message.conversationId,
      eventAt: message.createdAt,
      timezone: user.timezone,
      requestedFact: canonicalMemorySubject(explicitContent, user),
    };
  }

  private requestKey(context: MemoryWriteContext, action: string): string {
    if (!context.idempotencyKey)
      throw fail(
        'Memory writes require a request identity.',
        HttpStatus.BAD_REQUEST,
      );

    return memoryChecksum(`${action}\0${context.idempotencyKey}`);
  }

  private replayed(
    snapshots: MemorySourceSnapshot[],
    requestKey: string,
    fingerprint: string,
  ): MemoryMutationReceipt {
    if (
      snapshots.some(
        ({ deliveries }) =>
          deliveries.find((delivery) => delivery.requestKey === requestKey)
            ?.requestFingerprint !== fingerprint,
      )
    )
      throw fail(
        'This memory request identity was already used with different input.',
      );

    return this.receipt(snapshots, requestKey);
  }

  private receipt(
    snapshots: MemorySourceSnapshot[],
    requestKey: string,
  ): MemoryMutationReceipt {
    const deliveries = snapshots.map(({ deliveries }) =>
      deliveries.find((delivery) => delivery.requestKey === requestKey)!,
    );

    const withdrawn =
      snapshots.some(
        ({ source }, index) =>
          source.state === 'deleted' ||
          deliveries[index]!.generation !== source.generation,
      ) ||
      deliveries.some(({ state }) =>
        ['failed', 'erase_pending', 'erased'].includes(state),
      );

    const status = withdrawn
      ? 'withdrawn'
      : deliveries.every(({ state }) => state === 'admitted')
        ? 'completed'
        : 'queued';

    return {
      engine: 'hindsight',
      status,
      id: `hs:${snapshots.map(({ source }, index) => `${source.id}:${deliveries[index]!.generation}`).join(',')}`,
      sourceIds: snapshots.map(({ source }) => source.id),
      generation:
        snapshots.length === 1 ? deliveries[0]!.generation : undefined,
      message:
        status === 'completed'
          ? 'Memory retention confirmed.'
          : status === 'queued'
            ? 'Memory request queued; retention is not yet confirmed.'
            : 'This request was superseded, removed, or not admitted.',
    };
  }

  private async wake(bankId: string): Promise<void> {
    try {
      await this.queues.memoryDeliveries.add('deliver', {
        kind: 'bank',
        bankId,
      });
    } catch {
      this.logger.warn(
        'Memory queue publication failed; durable recovery will deliver the request.',
      );
    }
  }
}
