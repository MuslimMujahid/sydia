import type { Topic } from '../../database/entities';

function normalize(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Whether a message names a topic outright: its label or one of its aliases
 * appears as whole words. Used to lift an episode suppression when the user
 * brings the topic back, and to let a dismissed topic return (TOPIC-RECOG-01,
 * TOPIC-DISC-01). Names shorter than four characters never count.
 */
export function namesTopic(
  text: string,
  topic: Pick<Topic, 'label' | 'aliases'>,
): boolean {
  const haystack = ` ${normalize(text)} `;

  return [topic.label, ...topic.aliases].some((name) => {
    const needle = normalize(name);

    return needle.length >= 4 && haystack.includes(` ${needle} `);
  });
}
