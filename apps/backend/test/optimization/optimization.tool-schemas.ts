import { jsonSchema, tool, type ToolSet } from 'ai';
import { createDomainTools } from '../../src/modules/conversations/services/domain-tools';
import { createPhaseTools } from '../../src/modules/conversations/services/phase-tools';
import { createDailyNoteTools } from '../../src/modules/conversations/services/daily-note-tools';
import { terminalToolInputSchema } from '../../src/modules/conversations/services/terminal-tool-response';
import { validateToolGroups } from '../../src/modules/conversations/services/tool-groups';

/** No live repository/client can be reached, even if a factory changes. */
function unavailable<T extends object>(): T {
  return new Proxy({} as T, {
    get: () => {
      throw new Error(
        'Schema billing trials cannot access domain dependencies',
      );
    },
  });
}

/** Real advertised descriptions/schemas, with execution functions omitted. */
export function schemaOnlyTools(selected?: readonly string[]): ToolSet {
  const definitions = [
    ...createDomainTools({
      tasks: unavailable(),
      categories: unavailable(),
      reminders: unavailable(),
      memoryService: unavailable(),
      scheduler: unavailable(),
      users: unavailable(),
      secrets: unavailable(),
    }),
    ...createPhaseTools({
      contacts: unavailable(),
      contactGroups: unavailable(),
      documents: unavailable(),
      calendars: unavailable(),
      calendarService: unavailable(),
      users: unavailable(),
    }),
    ...createDailyNoteTools({ dailyNotes: unavailable() }),
  ].map(({ definition }) => definition);

  validateToolGroups(definitions.map(({ name }) => name));

  return Object.fromEntries(
    definitions
      .filter(({ name }) => selected === undefined || selected.includes(name))
      .map((definition) => [
        definition.name,
        tool({
          description: definition.description,
          inputSchema: jsonSchema(terminalToolInputSchema(definition)),
        }),
      ]),
  );
}
