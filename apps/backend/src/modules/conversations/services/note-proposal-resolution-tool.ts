import type {
  INoteAgentRunRepository,
  NoteAgentClaim,
} from '../../../database/interfaces';
import type { AssistantTool } from './tool-executor.service';

/** Resolves evaluation bookkeeping; never executes or grants a note write. */
export function createNoteProposalResolutionTool(
  claim: NoteAgentClaim,
  runs: INoteAgentRunRepository,
): AssistantTool {
  return {
    definition: {
      name: 'resolve_note_proposal',
      label: 'Resolve provisional note change',
      description:
        'Resolve a prior note_proposal from the supplied work ledger. A proposal is never a saved note. After a confirmed write, fulfilled requires the exact proposed tool and arguments; superseded records a revised plan and its confirmed receipt. Use dismissed with a grounded reason if the preview is no longer useful or already represented in the current notes. Read current documents before deciding. No note is written by this tool. Unresolved previews keep source work unfinished.',
      parameters: {
        type: 'object',
        properties: {
          workId: { type: 'string' },
          action: {
            type: 'string',
            enum: ['fulfilled', 'superseded', 'dismissed'],
          },
          reason: { type: 'string', minLength: 1, maxLength: 500 },
          receiptWorkId: {
            type: 'string',
            description:
              'Confirmed tool work ID from prior work, if available.',
          },
          receiptOperationId: {
            type: 'string',
            description:
              'Durable operationId used for a confirmed write in this run. Supply this or receiptWorkId.',
          },
        },
        required: ['workId', 'action', 'reason'],
        additionalProperties: false,
      },
    },
    parseArguments(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Expected proposal resolution arguments.');
      const data = value as Record<string, unknown>;
      if (
        typeof data.workId !== 'string' ||
        !data.workId ||
        !['fulfilled', 'superseded', 'dismissed'].includes(
          String(data.action),
        ) ||
        typeof data.reason !== 'string' ||
        !data.reason.trim() ||
        data.reason.length > 500 ||
        (data.receiptWorkId !== undefined &&
          typeof data.receiptWorkId !== 'string') ||
        (data.receiptOperationId !== undefined &&
          typeof data.receiptOperationId !== 'string') ||
        (data.receiptWorkId !== undefined &&
          data.receiptOperationId !== undefined)
      )
        throw new Error(
          'Invalid proposal resolution identity, action or reason.',
        );

      return {
        workId: data.workId,
        action: String(data.action),
        reason: data.reason.trim(),
        ...(data.receiptOperationId === undefined
          ? {}
          : { receiptOperationId: data.receiptOperationId }),
        ...(data.receiptWorkId === undefined
          ? {}
          : { receiptWorkId: data.receiptWorkId }),
      };
    },
    async execute(input) {
      if (input.userId !== claim.source.userId)
        throw new Error('Proposal resolution requires the source owner.');
      const data = input.arguments as {
        workId: string;
        action: 'fulfilled' | 'superseded' | 'dismissed';
        reason: string;
        receiptWorkId?: string;
        receiptOperationId?: string;
      };

      const result = await runs.resolveProposal(claim, data);
      if (result.status !== 'executed')
        throw new Error(`Proposal resolution rejected: ${result.status}.`);

      return { ...result.value, saved: false };
    },
  };
}
