import { advertisedInputSchema } from './advertised-tool-schema';
import { DomainToolsProvider } from './domain-tools.provider';
import { SkillCatalogService } from '../../secretary';
import type { AssistantToolDefinition } from './tool-executor.service';

/**
 * Serialized size of every tool definition the assistant can be offered, as
 * sent to the model (name, description, advertised schema). Measured at about
 * 4 bytes per token on the main model. Raise it only deliberately: run
 * `bun run eval:prompts` first, and prefer trimming text that repeats a rule
 * already stated elsewhere.
 */
// Raised from 89_000 for acknowledge_reminder and snooze_reminder (specs/010).
const TOOL_DEFINITION_BUDGET_BYTES = 92_500;

function registeredTools(): AssistantToolDefinition[] {
  const stub = {} as never;
  const dependencies: unknown[] = Array.from({ length: 24 }, () => stub);
  dependencies[19] = new SkillCatalogService();
  const Provider = DomainToolsProvider as unknown as new (
    ...args: unknown[]
  ) => DomainToolsProvider;

  return new Provider(...dependencies).tools.map(
    ({ definition }) => definition,
  );
}

describe('advertisedInputSchema', () => {
  const definition = (
    parameters: AssistantToolDefinition['parameters'],
    name = 'list_tasks',
  ): AssistantToolDefinition => ({
    name,
    label: 'Tool',
    description: 'A tool.',
    parameters,
  });

  it('drops keywords that do not guide the model, at every depth', () => {
    const parameters: AssistantToolDefinition['parameters'] = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 9007199254740991 },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              value: {
                anyOf: [{ type: 'integer', maximum: 9007199254740991 }],
              },
            },
          },
        },
      },
    };

    expect(advertisedInputSchema(definition(parameters))).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1 },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: { value: { anyOf: [{ type: 'integer' }] } },
          },
        },
      },
    });
    expect(parameters.$schema).toBeDefined();
  });

  it('keeps real bounds and the completeTurn flag of eligible tools', () => {
    const advertised = advertisedInputSchema(
      definition(
        {
          type: 'object',
          properties: { title: { type: 'string', maxLength: 160 } },
          required: ['title'],
        },
        'create_task',
      ),
    );

    expect(advertised.properties).toMatchObject({
      title: { type: 'string', maxLength: 160 },
      completeTurn: { type: 'boolean' },
    });
  });

  it('keeps the registered tool definitions within the size budget', () => {
    const bytes = registeredTools()
      .map((tool) =>
        Buffer.byteLength(
          JSON.stringify({
            name: tool.name,
            description: tool.description,
            parameters: advertisedInputSchema(tool),
          }),
        ),
      )
      .reduce((sum, size) => sum + size, 0);

    expect(bytes).toBeLessThanOrEqual(TOOL_DEFINITION_BUDGET_BYTES);
  });
});
