import type { AssistantTool } from './tool-executor.service';

/** Channel-specific presentation; canonical identities always come from tool output. */
export function withNoteReferenceGuidance(tool: AssistantTool): AssistantTool {
  return {
    ...tool,
    definition: {
      ...tool.definition,
      description: `${tool.definition.description}\nOn Web, reference returned notes as [exact title](#note/REF), URL-encoding the entire canonical ref (custom:ID or daily:YYYY-MM-DD). For daily notes use an absolute localized date as the label. Use only identities confirmed by this turn's tool results; show folder paths to distinguish duplicate titles. On Telegram and WhatsApp keep normal channel-native text without #note/ links.`,
    },
  };
}
