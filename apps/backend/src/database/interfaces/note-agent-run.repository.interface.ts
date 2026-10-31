import type { NoteWork, NoteWorkValue } from '../entities';

export const NOTE_AGENT_RUN_REPOSITORY = Symbol('INoteAgentRunRepository');

export type NoteAgentClaim = { source: NoteWork; token: string };

export type NoteAgentMutationResult<T> =
  { status: 'executed'; value: T } | { status: 'stale' | 'claim_lost' };

export interface INoteAgentRunRepository {
  resolveProposal(
    claim: NoteAgentClaim,
    resolution: {
      workId: string;
      action: 'fulfilled' | 'superseded' | 'dismissed';
      reason: string;
      receiptWorkId?: string;
      receiptOperationId?: string;
    },
  ): Promise<NoteAgentMutationResult<{ workId: string; status: string }>>;
  askQuestion(
    claim: NoteAgentClaim,
    question: string,
    existingMessageId?: string,
  ): Promise<NoteAgentMutationResult<{ workId: string }>>;
  recordProposal(
    claim: NoteAgentClaim,
    proposal: { key: string; value: NoteWorkValue },
  ): Promise<NoteAgentMutationResult<{ workId: string }>>;
  /** Reuses exact source-bound mutations and reconciles legacy duplicate receipts atomically. */
  withOperation<T>(
    claim: NoteAgentClaim,
    operation: {
      key: string;
      tool: string;
      arguments: NoteWorkValue;
      supersedesWorkIds?: readonly string[];
    },
    mutation: (key: string) => Promise<T>,
  ): Promise<NoteAgentMutationResult<T>>;
  /** The claim guard, mutation and its receipts share a single transaction. */
  withClaim<T>(
    claim: NoteAgentClaim,
    mutation: () => Promise<T>,
  ): Promise<NoteAgentMutationResult<T>>;
  claim(input: {
    userId?: string;
    idleMs: number;
    includeProposals?: boolean;
    sourceWorkId?: string;
  }): Promise<NoteAgentClaim | null>;
  finish(
    claim: NoteAgentClaim,
    result: {
      status:
        'proposal' | 'applied' | 'failed' | 'deferred' | 'needs_clarification';
      value: NoteWorkValue;
      errorCode?: string;
    },
  ): Promise<'recorded' | 'stale' | 'claim_lost'>;
}
