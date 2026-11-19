import { createSecretaryTools } from '../../secretary/secretary-tools';
import {
  defaultSkillDirectory,
  loadSkillCatalog,
} from '../../secretary/skill-catalog';
import { withSydiaGuideLinks } from './sydia-guide-links';
import type { AssistantTool } from './tool-executor.service';

function loadSkill(appUrl: string | undefined): AssistantTool {
  // Catalog integration: other dependencies are unused by the load_skill tool.
  const tools = createSecretaryTools({
    skills: loadSkillCatalog(defaultSkillDirectory()),
    context: {} as never,
    availability: {} as never,
    actions: {} as never,
    policy: {} as never,
  });

  return withSydiaGuideLinks(tools, appUrl).find(
    (tool) => tool.definition.name === 'load_skill',
  )!;
}

function run(tool: AssistantTool, args: Record<string, unknown>) {
  return tool.execute({
    userId: 'owner',
    sourceMessageId: 'message',
    idempotencyKey: 'load',
    arguments: tool.parseArguments(args),
  });
}

describe('withSydiaGuideLinks', () => {
  test('the guide and its references carry the configured app origin', async () => {
    const tool = loadSkill('https://app.example.com');

    await expect(run(tool, { name: 'sydia-guide' })).resolves.toMatchObject({
      skill: 'sydia-guide',
      appUrl: { origin: 'https://app.example.com' },
    });
    await expect(
      run(tool, { name: 'sydia-guide', reference: 'channels.md' }),
    ).resolves.toMatchObject({
      reference: 'channels.md',
      appUrl: { origin: 'https://app.example.com' },
    });
  });

  test('other skills load unchanged', async () => {
    const result = await run(loadSkill('https://app.example.com'), {
      name: 'scheduling',
    });

    expect(result).not.toHaveProperty('appUrl');
  });

  test('without a configured app address the guide gives no link base', async () => {
    const result = await run(loadSkill(undefined), { name: 'sydia-guide' });

    expect(result).toHaveProperty('skill', 'sydia-guide');
    expect(result).not.toHaveProperty('appUrl');
  });
});
