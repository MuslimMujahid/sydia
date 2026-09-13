import { Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AssistantPersona,
  SupportedLocale,
} from '../../database/entities';
import type { ModelMessage } from '../../infra/model-gateway';

const PERSONA_FILES: Record<AssistantPersona, string> = {
  professional: 'professional.md',
  friendly: 'friendly.md',
  cheerful: 'cheerful.md',
  calm: 'calm.md',
  playful: 'playful.md',
};

const logger = new Logger('BriefingPrompt');

/**
 * Persona voice is authored once, beside the chat prompts, so a briefing reads
 * in the same voice as the conversation it belongs to. Loading is best-effort:
 * a missing asset degrades the voice, never the briefing itself.
 */
export function loadPersonaPrompt(persona: AssistantPersona): string | null {
  const directory =
    typeof __dirname === 'string'
      ? join(__dirname, '../conversations/personas')
      : join(process.cwd(), 'src/modules/conversations/personas');

  try {
    return readFileSync(join(directory, PERSONA_FILES[persona]), 'utf8').trim();
  } catch (error) {
    logger.warn(
      `Failed to load persona ${persona}: ${error instanceof Error ? error.message : String(error)}`,
    );

    return null;
  }
}

export type BriefingSnapshot = {
  date: string;
  timezone: string;
  instant: string;
  events: Array<{ title: string; startAt: string; endAt: string }>;
  tasksDueToday: Array<{
    title: string;
    priority: string;
    dueAt: string | null;
  }>;
  overdueTasks: Array<{
    title: string;
    priority: string;
    dueAt: string | null;
  }>;
  remindersToday: Array<{ title: string; scheduledAt: string }>;
  overdueReminders: Array<{ title: string; scheduledAt: string }>;
};

const BRIEFING_INSTRUCTIONS = `You write one user's daily briefing as a single chat message.

Ground every statement in the supplied data. Never invent an item, a time, or a count, and never claim something was done when the data does not say so.

Composition rules:
- Lead with what actually matters today rather than walking the data in order.
- Overdue work outranks work that is merely due today; surface it first.
- Name the count when a category holds several items, and list titles compactly.
- When a category is empty, do not mention it at all.
- When the whole day is empty, say so in one short, warm line and stop.
- Stay under 120 words.

Formatting rules:
- Write plain text for a narrow chat window: no Markdown, no tables, no headings, no code blocks, no bold or italic markers.
- Use literal Unicode emoji as visual anchors, sparingly and only where they aid scanning.
- Use short paragraphs or simple bullets, whichever reads better.

Close with one concrete next step drawn from the data, or with no closing question when none is warranted.`;

/**
 * Builds the briefing request. The day's records travel as JSON so the model
 * composes prose from structured facts instead of re-deriving them.
 */
export function buildBriefingMessages(input: {
  locale: SupportedLocale;
  address: string | null;
  personaPrompt: string | null;
  snapshot: BriefingSnapshot;
}): ModelMessage[] {
  const addressInstruction = input.address
    ? ` Address the user as "${input.address}".`
    : '';

  const personaBlock = input.personaPrompt
    ? `\n\nAdopt this persona, adjusting its formatting preferences to the rules above:\n${input.personaPrompt}`
    : '';

  return [
    {
      role: 'system',
      content: `${BRIEFING_INSTRUCTIONS}\n\nWrite in ${input.locale === 'id' ? 'Indonesian' : 'English'}.${addressInstruction}${personaBlock}`,
    },
    { role: 'user', content: JSON.stringify(input.snapshot) },
  ];
}
