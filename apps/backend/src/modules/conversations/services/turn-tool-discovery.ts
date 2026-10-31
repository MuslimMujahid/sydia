import type { AssistantSkillState } from './tool-executor.service';

const NOTE_WRITES = new Set([
  'write_daily_note',
  'create_custom_note',
  'update_custom_note',
  'manage_notes_item',
]);

/** Initial routing offers reads; loaded guidance exposes note mutations. */
export function activeTurnTools(
  initial: readonly string[],
  skills: AssistantSkillState,
): string[] {
  return [...new Set([...initial, ...skills.activeTools])].filter(
    (name) => !NOTE_WRITES.has(name) || skills.activeTools.has(name),
  );
}
