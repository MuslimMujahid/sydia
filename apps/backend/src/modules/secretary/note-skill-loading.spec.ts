import { activeTurnTools } from '../conversations/services/turn-tool-discovery';
import { createSecretaryTools } from './secretary-tools';
import { defaultSkillDirectory, loadSkillCatalog } from './skill-catalog';
import type { AssistantSkillState } from '../conversations/services/tool-executor.service';

function loadTool() {
  // Catalog integration: other dependencies are unused by the load_skill tool.
  return createSecretaryTools({
    skills: loadSkillCatalog(defaultSkillDirectory()),
    context: {} as never,
    availability: {} as never,
    actions: {} as never,
    policy: {} as never,
  }).find((tool) => tool.definition.name === 'load_skill')!;
}

test('loading note guidance exposes note capabilities in the existing agent turn', async () => {
  const tool = loadTool();
  const skills: AssistantSkillState = {
    loaded: new Map(),
    activeTools: new Set(['load_skill']),
    loads: 0,
    evidence: new Set(),
  };

  const initial = [
    'read_daily_note',
    'write_daily_note',
    'create_custom_note',
    'update_custom_note',
    'manage_notes_item',
    'create_task',
  ];

  expect(activeTurnTools(initial, skills)).toContain('read_daily_note');
  expect(activeTurnTools(initial, skills)).toContain('create_task');
  expect(activeTurnTools(initial, skills)).not.toContain('write_daily_note');
  expect(activeTurnTools(initial, skills)).not.toContain('create_custom_note');
  expect(activeTurnTools(initial, skills)).not.toContain('update_custom_note');
  expect(activeTurnTools(initial, skills)).not.toContain('manage_notes_item');

  const result = await tool.execute({
    userId: 'owner',
    sourceMessageId: 'message',
    idempotencyKey: 'load-notes',
    arguments: tool.parseArguments({ name: 'note-capture' }),
    context: { trigger: 'user', skills },
  });

  expect(result).toMatchObject({
    skill: 'note-capture',
    version: '1.5.0',
  });
  expect(result).toHaveProperty(
    'guidance',
    loadSkillCatalog(defaultSkillDirectory()).find(
      (skill) => skill.name === 'note-capture',
    )!.body,
  );
  expect(skills.loaded.get('note-capture')).toBe('1.5.0');
  expect(activeTurnTools(initial, skills)).toEqual(
    expect.arrayContaining([
      'write_daily_note',
      'create_custom_note',
      'update_custom_note',
      'manage_notes_item',
      'search_notes',
      'create_task',
    ]),
  );
  expect([...skills.activeTools]).toEqual(
    expect.arrayContaining([
      'search_notes',
      'read_custom_note',
      'write_daily_note',
      'create_custom_note',
      'update_custom_note',
    ]),
  );
  expect(skills.activeTools.has('create_task')).toBe(false);
});

test('loading note guidance cannot expand a background run beyond its allowed tools', async () => {
  const tool = loadTool();
  const skills: AssistantSkillState = {
    loaded: new Map(),
    activeTools: new Set(['load_skill']),
    allowedTools: new Set(['load_skill', 'read_custom_note']),
    loads: 0,
    evidence: new Set(),
  };

  await tool.execute({
    userId: 'owner',
    sourceMessageId: 'message',
    idempotencyKey: 'read-only-notes',
    arguments: tool.parseArguments({ name: 'note-capture' }),
    context: { trigger: 'background', skills },
  });

  expect([...skills.activeTools]).toEqual(['load_skill', 'read_custom_note']);
});
