import { prepareDailyNoteWrite } from './daily-note-write';
import { Logger } from '@nestjs/common';
import type {
  INoteAgentRunRepository,
  NoteAgentClaim,
} from '../../../database/interfaces';
import type { NoteWorkValue } from '../../../database/entities';
import type { RichTextDocument } from '../../../shared/rich-text';
import {
  DailyNoteService,
  localDayKey,
} from '../../daily-notes/daily-note.service';
import type { NotesService } from '../../notes/notes.service';
import type { AssistantTool } from './tool-executor.service';
import { prepareNoteWorkspaceCommand } from './note-workspace-command';

const PROPOSABLE = new Set([
  'write_daily_note',
  'create_custom_note',
  'update_custom_note',
  'manage_notes_item',
]);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected proposal object.');

  return value as Record<string, unknown>;
}

/** Proposal capture has no reference to a mutating execute function. */
export function createNoteProposalTool(input: {
  tools: AssistantTool[];
  claim: NoteAgentClaim;
  runs: INoteAgentRunRepository;
  notes: NotesService;
  daily: DailyNoteService;
}): AssistantTool {
  const candidates = input.tools.filter((tool) =>
    PROPOSABLE.has(tool.definition.name),
  );

  return {
    definition: {
      name: 'propose_note_change',
      label: 'Record proposed note change',
      description:
        'Persist a concrete note change for evaluation without writing any product note. Inspect current documents and use their revisions. Supply the same arguments the named note tool would receive; descriptions below describe those schemas, not authorization to execute them. Store each useful change here rather than only describing it in final prose. Use a new proposalId when revising a proposal. This tool returns saved:false; proposal storage never means the note was saved.',
      parameters: {
        type: 'object',
        properties: {
          proposalId: {
            type: 'string',
            pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$',
          },
          tool: {
            type: 'string',
            enum: candidates.map((tool) => tool.definition.name),
          },
          arguments: { type: 'object' },
        },
        required: ['proposalId', 'tool', 'arguments'],
        additionalProperties: false,
        oneOf: candidates.map((tool) => ({
          properties: {
            tool: { const: tool.definition.name },
            arguments: tool.definition.parameters,
          },
        })),
      },
    },
    parseArguments(value) {
      const data = object(value);
      if (
        typeof data.proposalId !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(data.proposalId) ||
        typeof data.tool !== 'string' ||
        !candidates.some((tool) => tool.definition.name === data.tool)
      )
        throw new Error('Expected valid proposal identity and note tool.');
      object(data.arguments);

      return JSON.parse(JSON.stringify(data)) as Exclude<NoteWorkValue, null>;
    },
    async execute(request) {
      if (request.userId !== input.claim.source.userId) {
        Logger.warn('Rejected foreign note proposal.', 'NoteAgentProposals');
        throw new Error('A proposal requires the source owner.');
      }

      const data = object(request.arguments);
      const tool = candidates.find(
        (candidate) => candidate.definition.name === data.tool,
      );

      if (!tool || typeof data.proposalId !== 'string')
        throw new Error('Unknown note proposal tool.');
      const raw = object(data.arguments);
      for (const required of tool.definition.parameters.required ?? [])
        if (!(required in raw))
          throw new Error(`Missing proposal argument: ${required}.`);
      const args = object(tool.parseArguments(raw));
      let ref: string | null = null;
      let version: string | null = null;
      let document: RichTextDocument | null = null;
      let effect: unknown = null;

      if (tool.definition.name === 'write_daily_note') {
        const date =
          args.date === undefined
            ? localDayKey(
                input.claim.source.sourceAt,
                input.claim.source.timezone,
              )
            : args.date;

        if (typeof date !== 'string')
          throw new Error('Invalid proposed daily date.');
        const current = await input.daily.findByDate(request.userId, date);
        const prepared = prepareDailyNoteWrite(args, date, current);
        version = current?.updatedAt.toISOString() ?? null;
        document = prepared.document;
        args.date = prepared.date;
        ref = `daily:${prepared.date}`;
      } else {
        const command = prepareNoteWorkspaceCommand(
          input.notes,
          tool.definition.name,
          args,
          {
            userId: request.userId,
            requestKey: `proposal:${input.claim.source.id}:${data.proposalId}`,
          },
        );

        const preview = await input.notes.preview(
          request.userId,
          command,
          input.claim.source.sourceAt,
        );

        ref = command.action === 'create' ? null : `custom:${command.id}`;
        version = preview.expectedVersion;
        effect = preview.effect;
        document =
          preview.item.kind === 'note' && command.action !== 'delete'
            ? preview.item.content
            : null;
      }

      const value = JSON.parse(
        JSON.stringify({
          tool: data.tool,
          arguments: args,
          destinationRef: ref,
          expectedVersion: version,
          document,
          effect,
        }),
      ) as NoteWorkValue;

      const recorded = await input.runs.recordProposal(input.claim, {
        key: `proposal:${input.claim.source.id}:${data.proposalId}`,
        value,
      });

      if (recorded.status !== 'executed')
        throw new Error(`Proposal not recorded: ${recorded.status}.`);

      return {
        status: 'proposal',
        saved: false,
        workId: recorded.value.workId,
        proposal: value,
      };
    },
  };
}
