import type {
  NoteWorkPayload,
  NoteWorkValue,
} from '../../../database/entities';
import type { NoteMutationService } from '../../notes/note-mutation.service';
import type { NotesService } from '../../notes/notes.service';
import type { DailyNoteService } from '../../daily-notes/daily-note.service';
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

/** Applied to the production registry, covering normal and direct tool execution. */
export function protectNoteTools(
  tools: AssistantTool[],
  deps: {
    mutations: NoteMutationService;
    notes: NotesService;
    daily: DailyNoteService;
  },
): AssistantTool[] {
  return tools.map((tool) => {
    if (!MUTATIONS.has(tool.definition.name)) return tool;

    return {
      ...tool,
      execute: async (input) => {
        const raw = input.arguments;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
          throw new Error('Expected note tool arguments.');
        const args = raw as NoteWorkPayload;
        const name = tool.definition.name;
        const dailyDate =
          name === 'write_daily_note'
            ? typeof args.date === 'string'
              ? args.date
              : await deps.daily.today(input.userId, input.context?.now)
            : undefined;

        const destinationRef = dailyDate
          ? `daily:${dailyDate}`
          : typeof args.id === 'string'
            ? `custom:${args.id}`
            : undefined;

        const result = await deps.mutations.execute(
          {
            userId: input.userId,
            sourceMessageId: input.sourceMessageId,
            sourceWork: input.context?.noteSourceWork,
            key: `tool:${input.idempotencyKey}`,
            tool: name,
            arguments: { ...args, ...(dailyDate ? { date: dailyDate } : {}) },
            destinationRef,
            refs: async () => {
              if (dailyDate) return [`daily:${dailyDate}`];
              if (
                name === 'create_custom_note' ||
                name === 'create_record_note' ||
                (name === 'manage_notes_item' &&
                  args.action === 'create_folder')
              )
                return [`new:${input.idempotencyKey}`];
              if (typeof args.id !== 'string')
                throw new Error('A note mutation requires a target id.');
              // Resolve descendants under the same presence lock as the mutation.
              const { items } = await deps.notes.list(input.userId);
              const ids = new Set([args.id]);
              let changed = true;

              while (changed) {
                changed = false;

                for (const item of items) {
                  if (
                    item.parentId &&
                    ids.has(item.parentId) &&
                    !ids.has(item.id)
                  ) {
                    ids.add(item.id);
                    changed = true;
                  }
                }
              }

              return [...ids].map((id) => `custom:${id}`);
            },
          },
          async () =>
            JSON.parse(
              JSON.stringify(
                await tool.execute({
                  ...input,
                  arguments: {
                    ...raw,
                    ...(dailyDate ? { date: dailyDate } : {}),
                  },
                }),
              ),
            ) as NoteWorkValue,
        );

        // Tool output supports JSON null only as a nested value.
        return result === null ? { result: null } : result;
      },
    };
  });
}
