import { Logger } from '@nestjs/common';
import type { NoteWorkValue } from '../../../database/entities';
import { localDayKey } from '../../daily-notes/daily-note.service';
import type {
  INoteAgentRunRepository,
  NoteAgentClaim,
} from '../../../database/interfaces';
import type { AssistantTool } from './tool-executor.service';

const MUTATIONS = new Set([
  'create_record_note',
  'change_record_schema',
  'add_record_rows',
  'update_record_rows',
  'delete_record_rows',
  'write_daily_note',
  'create_custom_note',
  'update_custom_note',
  'manage_notes_item',
]);

function supersededIds(value: unknown): string[] {
  if (value === undefined) return [];

  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 16 ||
    value.some(
      (id: unknown) =>
        typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id),
    ) ||
    new Set(value).size !== value.length
  ) {
    Logger.warn(
      'Rejected invalid note replacement operation references.',
      'NoteAgentTools',
    );
    throw new Error('supersedesWorkIds must contain 1–16 distinct work IDs.');
  }

  return value as string[];
}

/** Projects existing protected tools into a single claimed background run. */
export function claimNoteAgentTools(
  tools: AssistantTool[],
  claim: NoteAgentClaim,
  runs: INoteAgentRunRepository,
): AssistantTool[] {
  return tools.map((tool) => {
    if (!MUTATIONS.has(tool.definition.name)) return tool;

    return {
      ...tool,
      definition: {
        ...tool.definition,
        parameters: {
          ...tool.definition.parameters,
          properties: {
            ...tool.definition.parameters.properties,
            operationId: {
              type: 'string',
              pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$',
              description:
                'Durable identity for this source change. Reuse its identity and arguments when retrying an unfinished operation. Confirmed receipts identify changes already applied; do not repeat those changes with a new identity.',
            },
            supersedesWorkIds: {
              type: 'array',
              minItems: 1,
              maxItems: 16,
              uniqueItems: true,
              items: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,128}$' },
              description:
                'Optional unfinished tool work IDs from the supplied prior work that this fresh edit replaces after a revision conflict or revised plan. Use a new operationId and freshly read document revision; preserve unrelated user changes. Old operations retire only after this write is confirmed. Omit when retrying identical arguments or when no earlier operation is replaced. Reuse the same references on retries.',
            },
          },
          required: [
            ...(tool.definition.parameters.required ?? []),
            'operationId',
          ],
        },
      },
      parseArguments: (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw new Error('Expected note change arguments with operationId.');
        const { operationId, supersedesWorkIds, ...change } = value as Record<
          string,
          unknown
        >;

        if (
          typeof operationId !== 'string' ||
          !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(operationId)
        )
          throw new Error(
            'A note change requires a valid durable operationId.',
          );

        return {
          operationId,
          change: tool.parseArguments(change),
          ...(supersedesWorkIds === undefined
            ? {}
            : { supersedesWorkIds: supersededIds(supersedesWorkIds) }),
        };
      },
      execute: async (input) => {
        const args = input.arguments;

        if (
          !args ||
          typeof args !== 'object' ||
          Array.isArray(args) ||
          !('operationId' in args) ||
          typeof args.operationId !== 'string' ||
          !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(args.operationId) ||
          !('change' in args) ||
          args.change === undefined ||
          args.change === null ||
          input.userId !== claim.source.userId
        ) {
          Logger.warn(
            'Rejected invalid or foreign claimed note operation.',
            'NoteAgentTools',
          );
          throw new Error('Invalid claimed note operation.');
        }

        const parsed = tool.parseArguments(args.change);
        const change =
          tool.definition.name === 'write_daily_note' &&
          parsed &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed)
            ? {
                ...parsed,
                date:
                  'date' in parsed && typeof parsed.date === 'string'
                    ? parsed.date
                    : localDayKey(claim.source.sourceAt, claim.source.timezone),
              }
            : parsed;

        const operationId = args.operationId;
        const result = await runs.withOperation(
          claim,
          {
            key: `tool:note-agent:${claim.source.id}:${operationId}`,
            tool: tool.definition.name,
            arguments: JSON.parse(JSON.stringify(change)) as NoteWorkValue,
            ...('supersedesWorkIds' in args
              ? { supersedesWorkIds: supersededIds(args.supersedesWorkIds) }
              : {}),
          },
          (key) =>
            tool.execute({
              ...input,
              arguments: change,
              sourceMessageId: claim.source.sourceRef,
              idempotencyKey: key.slice('tool:'.length),
              context: { ...input.context, noteSourceWork: claim.source },
            }),
        );

        if (result.status !== 'executed')
          throw new Error(
            `Note mutation rejected: ${result.status}. Retain unfinished work.`,
          );

        return result.value;
      },
    };
  });
}
