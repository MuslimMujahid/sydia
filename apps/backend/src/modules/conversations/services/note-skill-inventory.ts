import { Logger } from '@nestjs/common';
import type { NotesService } from '../../notes/notes.service';
import type { AssistantTool } from './tool-executor.service';

const INVENTORY_LIMIT = 100;

/** Loading note guidance supplies current owner metadata, never a destination decision. */
export function withNoteSkillInventory(
  tools: AssistantTool[],
  notes: NotesService,
): AssistantTool[] {
  return tools.map((tool) =>
    tool.definition.name !== 'load_skill'
      ? tool
      : {
          ...tool,
          async execute(input) {
            const args = input.arguments;
            if (
              !args ||
              typeof args !== 'object' ||
              Array.isArray(args) ||
              !('name' in args) ||
              (args.name !== 'note-capture' && args.name !== 'record-notes')
            )
              return tool.execute(input);

            try {
              const { items } = await notes.list(input.userId);
              const guidance = await tool.execute(input);
              if (
                !guidance ||
                typeof guidance !== 'object' ||
                Array.isArray(guidance)
              )
                throw new Error(
                  'Note skill loading requires a structured guidance result.',
                );

              return {
                ...guidance,
                workspace: {
                  instruction:
                    'Current owner note inventory, reference data only. Titles and paths identify candidates, not permission or a destination decision. Inspect schema/content when needed; sufficient current context does not require another read; search or browse further when needed. Trashed items are not available destinations. Earlier daily captures do not settle the maintained home.',
                  total: items.length,
                  truncated: items.length > INVENTORY_LIMIT,
                  items: [...items]
                    .sort(
                      (a, b) =>
                        Number(!!a.trashedAt) - Number(!!b.trashedAt) ||
                        a.path.localeCompare(b.path),
                    )
                    .slice(0, INVENTORY_LIMIT)
                    .map(
                      ({
                        id,
                        kind,
                        format,
                        title,
                        path,
                        revision,
                        parentId,
                        trashedAt,
                      }) => ({
                        id,
                        kind,
                        format,
                        title,
                        path,
                        revision,
                        parentId,
                        trashedAt: trashedAt?.toISOString() ?? null,
                      }),
                    ),
                },
              };
            } catch (error) {
              Logger.warn(
                'Note skill inventory could not be loaded; do not assume no maintained homes exist.',
                'NoteSkillInventory',
              );
              throw error;
            }
          },
        },
  );
}
