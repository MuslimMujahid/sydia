import type { TopicStatus } from '../../database/entities';
import { TOPIC_SETTINGS } from './topic-settings';

/** Value of a decaying quantity after `elapsed` active days (TOPIC-RANK-02). */
export function decay(
  value: number,
  elapsedActiveDays: number,
  halfLife: number = TOPIC_SETTINGS.halfLifeActiveDays,
): number {
  if (elapsedActiveDays <= 0) return value;

  return value * 2 ** (-elapsedActiveDays / halfLife);
}

/** Salience as of `activeDay`, decayed lazily from its stored value. */
export function currentSalience(
  topic: { salience: number; salienceAtActiveDay: number },
  activeDay: number,
): number {
  return decay(topic.salience, activeDay - topic.salienceAtActiveDay);
}

/** Folds one event into the stored salience; it never goes below zero. */
export function addSalience(
  topic: { salience: number; salienceAtActiveDay: number },
  weight: number,
  activeDay: number,
): { salience: number; salienceAtActiveDay: number } {
  return {
    salience: Math.max(0, currentSalience(topic, activeDay) + weight),
    salienceAtActiveDay: Math.max(activeDay, topic.salienceAtActiveDay),
  };
}

export function cosineSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const x = a[index]!;
    const y = b[index]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

export type RankInput = {
  similarity: number;
  /** Current (decayed) salience. */
  salience: number;
  /** 1 / (1 + days until the nearest pending linked item), else 0. */
  urgency: number;
  /** Recognized earlier in the current episode. */
  sticky: boolean;
  /** Decayed count of recent disconnects. */
  recentDisconnects: number;
};

/**
 * TOPIC-RANK-03. Similarity dominates; salience enters through log(1 + S)
 * with a small weight, so a frequent topic only breaks ties.
 */
export function candidateScore(
  input: RankInput,
  weights: {
    frequency: number;
    urgency: number;
    stickiness: number;
    disconnect: number;
  } = TOPIC_SETTINGS.rankWeights,
): number {
  return (
    input.similarity +
    weights.frequency * Math.log1p(Math.max(0, input.salience)) +
    weights.urgency * input.urgency +
    weights.stickiness * (input.sticky ? 1 : 0) -
    weights.disconnect * input.recentDisconnects
  );
}

/** Whether a topic may be a candidate at all (TOPIC-RECOG-01). */
export function passesFloor(
  status: TopicStatus,
  similarity: number,
  anchored: boolean,
): boolean {
  if (status === 'candidate') return false;
  // A dismissed topic needs a strong match even when something anchors it.
  if (status === 'dismissed')
    return similarity >= TOPIC_SETTINGS.similarityFloor.dismissed;

  return anchored || similarity >= TOPIC_SETTINGS.similarityFloor[status];
}
