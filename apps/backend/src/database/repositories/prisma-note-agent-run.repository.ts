import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type { NoteWork } from '../entities';
import {
  NOTE_WORK_REPOSITORY,
  type INoteWorkRepository,
  type INoteAgentRunRepository,
  type NoteAgentClaim,
  type NoteAgentMutationResult,
} from '../interfaces';

const RUN_LEASE_MS = 120_000;
const MAX_RUN_FAILURES = 5;

class ExpiredMutationClaim extends Error {}
class NoteReplacementError extends Error {}

type ReplacementState = {
  plan: NoteWork;
  operations: NoteWork[];
  ancestorPlans: NoteWork[];
  relatedPlans: NoteWork[];
};
const REPLACEABLE_STATUSES = ['pending', 'deferred', 'failed'];
const MAX_REPLACEMENT_OPERATIONS = 32;

@Injectable()
export class PrismaNoteAgentRunRepository implements INoteAgentRunRepository {
  private readonly logger = new Logger(PrismaNoteAgentRunRepository.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTE_WORK_REPOSITORY) private readonly work: INoteWorkRepository,
  ) {}

  askQuestion(
    claim: NoteAgentClaim,
    question: string,
    existingMessageId?: string,
  ): Promise<NoteAgentMutationResult<{ workId: string }>> {
    if (!question.trim() || question.length > 1000)
      this.rejectReplacement(
        'A note clarification requires a non-empty question of at most 1000 characters.',
      );

    return this.withClaim(claim, async () => {
      const current = await this.prisma.client.noteWork.findUniqueOrThrow({
        where: { id: claim.source.id },
      });

      const payload =
        current.payload &&
        typeof current.payload === 'object' &&
        !Array.isArray(current.payload)
          ? current.payload
          : {};

      let reusedMessage: { id: string; conversationId: string } | null = null;

      if (existingMessageId) {
        const evidence = await this.work.clarificationContext(current);
        const candidate = evidence.find(
          (message) => message.id === existingMessageId,
        );

        const priorAnswer =
          typeof payload.answerSourceRef === 'string'
            ? await this.prisma.client.message.findFirstOrThrow({
                where: {
                  id: payload.answerSourceRef,
                  userId: current.userId,
                  role: 'user',
                },
                select: { createdAt: true },
              })
            : null;

        if (
          !candidate ||
          candidate.role !== 'assistant' ||
          candidate.content.trim() !== question.trim() ||
          (priorAnswer && candidate.createdAt <= priorAnswer.createdAt)
        )
          this.rejectReplacement(
            'Reuse requires the exact unanswered assistant question from this source conversation.',
          );
        reusedMessage = await this.prisma.client.message.findFirstOrThrow({
          where: {
            id: existingMessageId,
            userId: current.userId,
            role: 'assistant',
          },
          select: { id: true, conversationId: true },
        });
      }

      if (
        typeof payload.question === 'string' &&
        payload.question !== question.trim()
      )
        this.rejectReplacement(
          'One unresolved clarification is already recorded for this source.',
        );

      if (
        typeof payload.question === 'string' &&
        typeof payload.clarificationMessageId === 'string'
      ) {
        if (
          existingMessageId &&
          payload.clarificationMessageId !== existingMessageId
        )
          this.rejectReplacement(
            'An unresolved clarification already references another message.',
          );

        return { workId: current.id };
      }

      await this.prisma.client.noteWork.update({
        where: { id: current.id },
        data: {
          clarificationMessageId: reusedMessage?.id ?? null,
          payload: {
            ...payload,
            question: question.trim(),
            clarificationMessageId: reusedMessage?.id ?? null,
            ...(reusedMessage
              ? { clarificationConversationId: reusedMessage.conversationId }
              : {}),
          },
        },
      });

      return { workId: current.id };
    });
  }

  resolveProposal(
    claim: NoteAgentClaim,
    resolution: Parameters<INoteAgentRunRepository['resolveProposal']>[1],
  ): ReturnType<INoteAgentRunRepository['resolveProposal']> {
    if (
      !['fulfilled', 'superseded', 'dismissed'].includes(resolution.action) ||
      !resolution.reason.trim() ||
      resolution.reason.length > 500
    )
      this.rejectReplacement(
        'A proposal resolution requires a valid action and a reason of at most 500 characters.',
      );

    return this.withClaim(claim, async () => {
      const tx = this.prisma.client;
      const scope = {
        userId: claim.source.userId,
        sourceKind: claim.source.sourceKind,
        sourceRef: claim.source.sourceRef,
        sourceVersion: claim.source.sourceVersion,
      };

      const proposal = await tx.noteWork.findFirst({
        where: { ...scope, id: resolution.workId, stage: 'note_proposal' },
      });

      if (!proposal)
        this.rejectReplacement(
          'Proposal resolution requires the same owner and source evidence.',
        );
      const value = {
        action: resolution.action,
        reason: resolution.reason.trim(),
        receiptWorkId: resolution.receiptWorkId ?? null,
        receiptOperationId: resolution.receiptOperationId ?? null,
      };

      if (proposal.status !== 'proposal') {
        if (!isDeepStrictEqual(proposal.payload, { resolution: value }))
          this.rejectReplacement(
            'A resolved proposal cannot be reopened or given a different outcome.',
          );

        return { workId: proposal.id, status: proposal.status };
      }

      if (resolution.action !== 'dismissed') {
        const receipt =
          resolution.receiptWorkId || resolution.receiptOperationId
            ? await tx.noteWork.findFirst({
                where: {
                  ...scope,
                  ...(resolution.receiptWorkId
                    ? { id: resolution.receiptWorkId }
                    : {
                        key: `tool:note-agent:${claim.source.id}:${resolution.receiptOperationId}`,
                      }),
                  stage: { in: ['tool', 'tool_alias'] },
                  status: 'applied',
                },
              })
            : null;

        if (!receipt)
          this.rejectReplacement(
            'A fulfilled or superseded proposal requires a confirmed write receipt for this source.',
          );

        if (resolution.action === 'fulfilled') {
          const planned = proposal.result;
          const applied = receipt.payload;
          if (
            !planned ||
            typeof planned !== 'object' ||
            Array.isArray(planned) ||
            !applied ||
            typeof applied !== 'object' ||
            Array.isArray(applied) ||
            planned.tool !== applied.tool ||
            !isDeepStrictEqual(planned.arguments, applied.arguments)
          )
            this.rejectReplacement(
              'Fulfillment requires the proposed tool and arguments; use superseded for a revised plan.',
            );
        }
      } else if (
        resolution.receiptWorkId !== undefined ||
        resolution.receiptOperationId !== undefined
      ) {
        this.rejectReplacement('Dismissal does not claim a write receipt.');
      }

      const status = resolution.action === 'fulfilled' ? 'applied' : 'rejected';
      await tx.noteWork.update({
        where: { id: proposal.id },
        data: {
          status,
          payload: { resolution: value },
          lastErrorCode:
            resolution.action === 'fulfilled'
              ? null
              : `proposal_${resolution.action}`,
        },
      });

      return { workId: proposal.id, status };
    });
  }

  recordProposal(
    claim: NoteAgentClaim,
    proposal: { key: string; value: import('../entities').NoteWorkValue },
  ): Promise<NoteAgentMutationResult<{ workId: string }>> {
    return this.withClaim(claim, async () => {
      const tx = this.prisma.client;
      const record = await tx.noteWork.upsert({
        where: {
          userId_key: { userId: claim.source.userId, key: proposal.key },
        },
        create: {
          userId: claim.source.userId,
          key: proposal.key,
          stage: 'note_proposal',
          status: 'proposal',
          sourceKind: claim.source.sourceKind,
          sourceRef: claim.source.sourceRef,
          sourceVersion: claim.source.sourceVersion,
          sourceAt: claim.source.sourceAt,
          timezone: claim.source.timezone,
          sourceContent: claim.source.sourceContent,
          payload: {},
          result:
            proposal.value === null
              ? Prisma.JsonNull
              : (proposal.value as Prisma.InputJsonValue),
        },
        update: {},
      });

      if (
        record.stage !== 'note_proposal' ||
        record.status !== 'proposal' ||
        record.sourceKind !== claim.source.sourceKind ||
        record.sourceRef !== claim.source.sourceRef ||
        record.sourceVersion !== claim.source.sourceVersion ||
        !isDeepStrictEqual(record.result, proposal.value)
      )
        this.rejectReplacement(
          'A note proposal identity cannot be reused for different evidence or changes.',
        );

      return { workId: record.id };
    });
  }

  withOperation<T>(
    claim: NoteAgentClaim,
    operation: Parameters<INoteAgentRunRepository['withOperation']>[1],
    mutation: (key: string) => Promise<T>,
  ): Promise<NoteAgentMutationResult<T>> {
    return this.withClaim(claim, async () => {
      const tx = this.prisma.client;
      const payload = { tool: operation.tool, arguments: operation.arguments };
      const requested = await tx.noteWork.findUnique({
        where: {
          userId_key: { userId: claim.source.userId, key: operation.key },
        },
      });

      if (
        requested &&
        (requested.sourceKind !== claim.source.sourceKind ||
          requested.sourceRef !== claim.source.sourceRef ||
          requested.sourceVersion !== claim.source.sourceVersion ||
          !['tool', 'tool_alias'].includes(requested.stage) ||
          !isDeepStrictEqual(requested.payload, payload))
      ) {
        this.logger.warn(
          'Rejected durable note operation identity reused for different evidence or arguments.',
          { workId: requested.id },
        );
        throw new Error(
          'A note operation identity cannot be reused for a different mutation.',
        );
      }

      if (
        requested &&
        ['rejected', 'stale', 'needs_clarification'].includes(requested.status)
      )
        this.rejectReplacement(
          'This note operation is retired or waiting for clarification; inspect its result before planning a new change.',
        );

      const retired = await tx.noteWork.findFirst({
        where: {
          userId: claim.source.userId,
          sourceKind: claim.source.sourceKind,
          sourceRef: claim.source.sourceRef,
          sourceVersion: claim.source.sourceVersion,
          stage: { in: ['tool', 'tool_alias'] },
          payload: { equals: payload },
          status: { in: ['rejected', 'stale', 'needs_clarification'] },
        },
        select: { id: true },
      });

      if (retired)
        this.rejectReplacement(
          'An identical note mutation is retired or waiting for clarification; do not replay it with a new identity.',
        );

      // Full mutation equality within one immutable source is replay identity.
      // Equal text or amounts in different source reports are never merged.
      const equivalent = {
        userId: claim.source.userId,
        sourceKind: claim.source.sourceKind,
        sourceRef: claim.source.sourceRef,
        sourceVersion: claim.source.sourceVersion,
        stage: 'tool',
        key: { startsWith: 'tool:' },
        payload: { equals: payload },
        status: { in: ['pending', 'deferred', 'failed', 'applied'] },
      } satisfies Prisma.NoteWorkWhereInput;

      const candidates = await tx.noteWork.findMany({
        where: equivalent,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      const canonical =
        candidates.find((item) => item.status === 'applied') ?? candidates[0];

      const key = canonical?.key ?? operation.key;
      const replacement = await this.prepareReplacement(
        claim,
        operation,
        requested,
        canonical,
      );

      if (canonical && canonical.key !== operation.key && !requested)
        await tx.noteWork.create({
          data: {
            userId: claim.source.userId,
            key: operation.key,
            stage: 'tool_alias',
            sourceKind: claim.source.sourceKind,
            sourceRef: claim.source.sourceRef,
            sourceVersion: claim.source.sourceVersion,
            sourceAt: claim.source.sourceAt,
            timezone: claim.source.timezone,
            sourceContent: claim.source.sourceContent,
            destinationRef: canonical.destinationRef,
            payload,
          },
        });
      const value = await mutation(key);
      const receipt = await tx.noteWork.findUnique({
        where: { userId_key: { userId: claim.source.userId, key } },
      });

      if (receipt?.status === 'applied')
        await tx.noteWork.updateMany({
          where: {
            ...equivalent,
            stage: { in: ['tool', 'tool_alias'] },
            id: { not: receipt.id },
            status: { in: ['pending', 'deferred', 'failed'] },
          },
          data: {
            status: 'applied',
            result:
              receipt.result === null
                ? Prisma.JsonNull
                : (receipt.result as Prisma.InputJsonValue),
            lastErrorCode: null,
          },
        });

      if (
        receipt?.status === 'applied' &&
        replacement &&
        replacement.plan.status !== 'applied'
      ) {
        const retired = await tx.noteWork.updateMany({
          where: {
            userId: claim.source.userId,
            id: { in: replacement.operations.map((item) => item.id) },
            status: { in: REPLACEABLE_STATUSES },
          },
          data: {
            status: 'rejected',
            lastErrorCode: 'superseded',
            result: { supersededByWorkId: receipt.id },
          },
        });

        if (retired.count !== replacement.operations.length)
          this.rejectReplacement(
            'A replaced note operation changed during commit; reread its confirmed result.',
          );
        await tx.noteWork.updateMany({
          where: {
            userId: claim.source.userId,
            id: { in: replacement.ancestorPlans.map((item) => item.id) },
          },
          data: {
            status: 'rejected',
            lastErrorCode: 'superseded',
            result: { supersededByWorkId: receipt.id },
          },
        });
        await tx.noteWork.updateMany({
          where: {
            id: {
              in: [
                replacement.plan.id,
                ...replacement.relatedPlans.map((item) => item.id),
              ],
            },
            userId: claim.source.userId,
          },
          data: {
            status: 'applied',
            lastErrorCode: null,
            result: {
              receiptWorkId: receipt.id,
              supersededWorkIds: replacement.operations.map((item) => item.id),
            },
          },
        });
      }

      return value;
    });
  }

  private rejectReplacement(message: string): never {
    this.logger.warn(message);
    throw new NoteReplacementError(message);
  }

  /** Called under the source claim transaction; retirement happens only with a confirmed write. */
  private async prepareReplacement(
    claim: NoteAgentClaim,
    operation: Parameters<INoteAgentRunRepository['withOperation']>[1],
    requested: NoteWork | null,
    canonical?: NoteWork,
  ): Promise<ReplacementState | null> {
    const tx = this.prisma.client;
    const ids = [...(operation.supersedesWorkIds ?? [])].sort();
    if (
      ids.length > 16 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !/^[a-zA-Z0-9_-]{1,128}$/.test(id))
    )
      this.rejectReplacement(
        'Note replacement requires at most 16 distinct work IDs.',
      );
    const scope = {
      userId: claim.source.userId,
      sourceKind: claim.source.sourceKind,
      sourceRef: claim.source.sourceRef,
      sourceVersion: claim.source.sourceVersion,
    };

    const planKey = `replan:${operation.key}`;
    const payload = { operationKey: operation.key, supersedesWorkIds: ids };
    const prior = await tx.noteWork.findUnique({
      where: { userId_key: { userId: claim.source.userId, key: planKey } },
    });

    if (
      prior &&
      (prior.stage !== 'tool_replan' ||
        prior.sourceKind !== scope.sourceKind ||
        prior.sourceRef !== scope.sourceRef ||
        prior.sourceVersion !== scope.sourceVersion ||
        !isDeepStrictEqual(prior.payload, payload))
    )
      this.rejectReplacement(
        'A note replacement identity cannot be reused for different superseded operations.',
      );
    const canonicalPlan =
      canonical && canonical.key !== operation.key
        ? await tx.noteWork.findUnique({
            where: {
              userId_key: {
                userId: scope.userId,
                key: `replan:${canonical.key}`,
              },
            },
          })
        : null;

    const canonicalIds: string[] = [];

    if (canonicalPlan) {
      const data = canonicalPlan.payload;
      if (
        canonicalPlan.stage !== 'tool_replan' ||
        canonicalPlan.sourceKind !== scope.sourceKind ||
        canonicalPlan.sourceRef !== scope.sourceRef ||
        canonicalPlan.sourceVersion !== scope.sourceVersion ||
        !['pending', 'applied'].includes(canonicalPlan.status) ||
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        data.operationKey !== canonical?.key ||
        !Array.isArray(data.supersedesWorkIds) ||
        data.supersedesWorkIds.length < 1 ||
        data.supersedesWorkIds.length > 16 ||
        data.supersedesWorkIds.some(
          (id) => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id),
        )
      )
        this.rejectReplacement(
          'Invalid durable dependencies for an equivalent note mutation.',
        );
      if (canonicalPlan.status === 'pending')
        canonicalIds.push(...(data.supersedesWorkIds as string[]));
    }

    // Naming the identical canonical write does not create a new
    // replacement dependency. Preserve its receipt identity and retry it.
    if (
      !prior &&
      !canonicalPlan &&
      canonical &&
      [...REPLACEABLE_STATUSES, 'applied'].includes(canonical.status) &&
      ids.length > 0
    ) {
      const matchingReferences = await tx.noteWork.count({
        where: {
          ...scope,
          id: { in: ids },
          stage: { in: ['tool', 'tool_alias'] },
          status: { in: [...REPLACEABLE_STATUSES, 'applied'] },
          payload: {
            equals:
              canonical.payload === null
                ? Prisma.JsonNull
                : (canonical.payload as Prisma.InputJsonValue),
          },
        },
      });

      if (matchingReferences === ids.length) {
        this.logger.log(
          'Reusing an identical note mutation receipt; no replacement or retirement is needed.',
        );

        return null;
      }
    }

    if (!ids.length && !canonicalIds.length) return null;
    if (ids.length && requested && !prior)
      this.rejectReplacement(
        'Use a new operation identity when replacing unfinished note work.',
      );
    if (prior?.status === 'applied')
      return {
        plan: prior,
        operations: [],
        ancestorPlans: [],
        relatedPlans: [],
      };
    if (prior && prior.status !== 'pending')
      this.rejectReplacement(
        'This note replacement plan is no longer applicable.',
      );

    const operations = new Map<string, NoteWork>();
    const ancestorPlans = new Map<string, NoteWork>();
    const visited = new Set<string>();
    const queue = [...ids, ...canonicalIds];

    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      if (visited.size > MAX_REPLACEMENT_OPERATIONS)
        this.rejectReplacement(
          'Note replacement ancestry exceeds its bounded operation limit.',
        );
      const old = await tx.noteWork.findFirst({
        where: { ...scope, id, stage: 'tool' },
      });

      if (
        !old ||
        !REPLACEABLE_STATUSES.includes(old.status) ||
        old.key === operation.key
      )
        this.rejectReplacement(
          'Replacement requires unfinished tool operations from the same owner and source.',
        );
      if (
        isDeepStrictEqual(old.payload, {
          tool: operation.tool,
          arguments: operation.arguments,
        })
      )
        this.rejectReplacement(
          'Retry an identical note mutation instead of replacing it.',
        );
      const group = await tx.noteWork.findMany({
        where: {
          ...scope,
          stage: { in: ['tool', 'tool_alias'] },
          payload: {
            equals:
              old.payload === null
                ? Prisma.JsonNull
                : (old.payload as Prisma.InputJsonValue),
          },
        },
      });

      if (group.some((item) => item.status === 'applied'))
        this.rejectReplacement(
          'A confirmed note mutation cannot be superseded or replayed.',
        );

      for (const item of group) {
        if (REPLACEABLE_STATUSES.includes(item.status))
          operations.set(item.id, item);
        if (operations.size > MAX_REPLACEMENT_OPERATIONS)
          this.rejectReplacement(
            'Note replacement exceeds its bounded operation limit.',
          );
      }

      const ancestor = await tx.noteWork.findUnique({
        where: {
          userId_key: { userId: scope.userId, key: `replan:${old.key}` },
        },
      });

      if (ancestor) {
        const data = ancestor.payload;
        if (
          ancestor.stage !== 'tool_replan' ||
          ancestor.sourceKind !== scope.sourceKind ||
          ancestor.sourceRef !== scope.sourceRef ||
          ancestor.sourceVersion !== scope.sourceVersion ||
          ancestor.status !== 'pending' ||
          !data ||
          typeof data !== 'object' ||
          Array.isArray(data) ||
          !Array.isArray(data.supersedesWorkIds) ||
          data.supersedesWorkIds.length < 1 ||
          data.supersedesWorkIds.length > 16 ||
          data.supersedesWorkIds.some(
            (value) =>
              typeof value !== 'string' ||
              !/^[a-zA-Z0-9_-]{1,128}$/.test(value),
          )
        )
          this.rejectReplacement(
            'Invalid durable note replacement ancestry; inspect the operation ledger.',
          );
        ancestorPlans.set(ancestor.id, ancestor);
        queue.push(...(data.supersedesWorkIds as string[]));
      }
    }

    const plan =
      (!ids.length ? canonicalPlan : prior) ??
      (await tx.noteWork.create({
        data: {
          ...scope,
          key: planKey,
          stage: 'tool_replan',
          sourceAt: claim.source.sourceAt,
          timezone: claim.source.timezone,
          sourceContent: claim.source.sourceContent,
          payload,
        },
      }));

    return {
      plan,
      operations: [...operations.values()],
      ancestorPlans: [...ancestorPlans.values()],
      relatedPlans:
        canonicalPlan &&
        canonicalPlan.id !== plan.id &&
        canonicalPlan.status === 'pending'
          ? [canonicalPlan]
          : [],
    };
  }

  async withClaim<T>(
    claim: NoteAgentClaim,
    mutation: () => Promise<T>,
  ): Promise<NoteAgentMutationResult<T>> {
    try {
      return await this.prisma.inTransaction(async (tx) => {
        const rows = await tx.$queryRaw<NoteWork[]>(
          Prisma.sql`SELECT * FROM note_work WHERE id=${claim.source.id} AND "userId"=${claim.source.userId} FOR UPDATE`,
        );

        const current = rows[0];
        const payload = current?.payload;

        if (
          !current ||
          current.status !== 'agent_running' ||
          !payload ||
          typeof payload !== 'object' ||
          Array.isArray(payload) ||
          payload.agentClaimToken !== claim.token ||
          !(await this.leaseValid(tx, current.id))
        ) {
          this.logger.warn(
            'Rejected note mutation from a worker without a live claim.',
            { workId: claim.source.id },
          );

          return { status: 'claim_lost' };
        }

        if (!(await this.work.sourceValid(current))) {
          this.logger.warn(
            'Rejected note mutation because source evidence changed.',
            { workId: current.id },
          );
          await tx.noteWork.update({
            where: { id: current.id },
            data: { status: 'stale', lastErrorCode: 'agent_source_changed' },
          });

          return { status: 'stale' };
        }

        const value = await mutation();
        // A slow mutation must not commit after its lease has expired.
        if (!(await this.leaseValid(tx, current.id)))
          throw new ExpiredMutationClaim(
            'Note mutation outlived its worker claim.',
          );

        return { status: 'executed', value };
      });
    } catch (error) {
      this.logger.error(
        'Guarded note mutation rolled back; retain unfinished work for recovery.',
        {
          workId: claim.source.id,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          reason:
            error instanceof NoteReplacementError ? error.message : undefined,
        },
      );
      if (error instanceof ExpiredMutationClaim)
        return { status: 'claim_lost' };
      throw error;
    }
  }

  private async leaseValid(
    tx: Prisma.TransactionClient,
    workId: string,
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ valid: boolean }>>(
      Prisma.sql`SELECT "nextAttemptAt" > clock_timestamp() AS valid FROM note_work WHERE id=${workId}`,
    );

    return rows[0]?.valid === true;
  }

  claim(input: {
    userId?: string;
    idleMs: number;
    includeProposals?: boolean;
    sourceWorkId?: string;
  }): Promise<NoteAgentClaim | null> {
    if (!Number.isFinite(input.idleMs) || input.idleMs < 0)
      throw new Error(
        'Agent source idle duration must be finite and non-negative.',
      );

    return this.prisma.inTransaction(async (tx) => {
      const candidates = await tx.$queryRaw<NoteWork[]>(Prisma.sql`
        SELECT w.* FROM note_work w
        WHERE w.stage='source' AND w.attempts < ${MAX_RUN_FAILURES}
        ${input.userId ? Prisma.sql`AND w."userId"=${input.userId}` : Prisma.empty}
        ${input.sourceWorkId ? Prisma.sql`AND w.id=${input.sourceWorkId}` : Prisma.empty}
        AND (w.status IN ('pending','deferred','failed','agent_running' ${input.includeProposals ? Prisma.sql`, 'proposal'` : Prisma.empty})
          ${
            input.includeProposals
              ? Prisma.sql`OR (w.status='applied' AND (w.result->>'text'='' OR EXISTS (
            SELECT 1 FROM note_work p WHERE p."userId"=w."userId"
              AND p."sourceKind"=w."sourceKind" AND p."sourceRef"=w."sourceRef"
              AND p."sourceVersion"=w."sourceVersion" AND p.stage='note_proposal' AND p.status='proposal'
          )))`
              : Prisma.empty
          })
        AND w."nextAttemptAt" <= clock_timestamp()
        AND w."sourceAt" <= clock_timestamp() - (${input.idleMs} * interval '1 millisecond')
        AND (w."sourceKind" != 'message' OR EXISTS (
          SELECT 1 FROM message m JOIN conversation c ON c.id=m."conversationId"
          WHERE m.id=w."sourceRef" AND m."userId"=w."userId"
          AND c."lastMessageAt" <= clock_timestamp() - (${input.idleMs} * interval '1 millisecond')
        ))
        ORDER BY w."createdAt", w.id LIMIT 1 FOR UPDATE OF w SKIP LOCKED
      `);

      const source = candidates[0];
      if (!source) return null;

      if (!(await this.work.sourceValid(source))) {
        await tx.noteWork.update({
          where: { id: source.id },
          data: { status: 'stale' },
        });

        return null;
      }

      if (
        source.status === 'agent_running' &&
        source.attempts + 1 >= MAX_RUN_FAILURES
      ) {
        this.logger.error(
          'Note agent source exhausted crash recovery attempts.',
          { workId: source.id },
        );
        await tx.noteWork.update({
          where: { id: source.id },
          data: {
            status: 'failed',
            attempts: MAX_RUN_FAILURES,
            lastErrorCode: 'agent_lease_exhausted',
          },
        });

        return null;
      }

      const token = randomUUID();
      const payload =
        source.payload &&
        typeof source.payload === 'object' &&
        !Array.isArray(source.payload)
          ? source.payload
          : {};

      const clocks = await tx.$queryRaw<Array<{ expiresAt: Date }>>(
        Prisma.sql`SELECT clock_timestamp() + (${RUN_LEASE_MS} * interval '1 millisecond') AS "expiresAt"`,
      );

      const claimed = await tx.noteWork.update({
        where: { id: source.id },
        data: {
          status: 'agent_running',
          nextAttemptAt: clocks[0]!.expiresAt,
          payload: { ...payload, agentClaimToken: token },
          ...(source.status === 'agent_running'
            ? { attempts: { increment: 1 } }
            : {}),
        },
      });

      return { source: claimed, token };
    });
  }

  finish(
    claim: NoteAgentClaim,
    result: Parameters<INoteAgentRunRepository['finish']>[1],
  ): ReturnType<INoteAgentRunRepository['finish']> {
    return this.prisma.inTransaction(async (tx) => {
      const rows = await tx.$queryRaw<NoteWork[]>(
        Prisma.sql`SELECT * FROM note_work WHERE id=${claim.source.id} AND "userId"=${claim.source.userId} FOR UPDATE`,
      );

      const current = rows[0];
      const payload = current?.payload;
      if (
        !current ||
        current.status !== 'agent_running' ||
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload) ||
        payload.agentClaimToken !== claim.token
      )
        return 'claim_lost';
      const lease = await tx.$queryRaw<Array<{ valid: boolean }>>(
        Prisma.sql`SELECT "nextAttemptAt" > clock_timestamp() AS valid FROM note_work WHERE id=${current.id}`,
      );

      if (!lease[0]?.valid) return 'claim_lost';

      if (!(await this.work.sourceValid(current))) {
        await tx.noteWork.update({
          where: { id: current.id },
          data: { status: 'stale', lastErrorCode: 'agent_source_changed' },
        });

        return 'stale';
      }

      await tx.noteWork.update({
        where: { id: current.id },
        data: {
          status:
            typeof payload.question === 'string' && payload.question.trim()
              ? 'needs_clarification'
              : result.status,
          result:
            result.value === null
              ? Prisma.JsonNull
              : (result.value as Prisma.InputJsonValue),
          lastErrorCode: result.errorCode ?? null,
          ...(result.status === 'failed' ? { attempts: { increment: 1 } } : {}),
        },
      });
      if (result.status === 'failed' || result.status === 'deferred')
        await tx.$executeRaw(
          Prisma.sql`UPDATE note_work SET "nextAttemptAt"=clock_timestamp() + interval '1 minute' WHERE id=${current.id}`,
        );

      return 'recorded';
    });
  }
}
