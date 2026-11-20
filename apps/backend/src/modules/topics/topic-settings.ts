import type { TopicClaimKind, TopicStatus } from '../../database/entities';

/**
 * Provisional tuning from docs/TOPIC_CONTEXT_SPEC.md section 13, calibrated
 * from shadow-mode logs before phase 2. The gate cutoff itself lives with the
 * other decision thresholds (`topicChoice`).
 */
export const TOPIC_SETTINGS = {
  /** Salience half-life, in the owner's active days (TOPIC-RANK-02). */
  halfLifeActiveDays: 14,
  /**
   * Minimum similarity to be offered to the gate without an explicit anchor.
   * Kept low on purpose: on 21 Nov 2026 a cross-language synonym scored 0.32
   * against its topic while unrelated family messages scored 0.31–0.38, so
   * similarity only drops clear non-matches and the gate decides.
   */
  similarityFloor: {
    candidate: 1,
    active: 0.2,
    dormant: 0.3,
    dismissed: 0.7,
  } satisfies Record<TopicStatus, number>,
  /** Topics logged per message for calibration, offered to the gate or not. */
  loggedTopics: 5,
  /** α, β, γ, δ of TOPIC-RANK-03. */
  rankWeights: {
    frequency: 0.05,
    urgency: 0.1,
    stickiness: 0.1,
    disconnect: 0.1,
  },
  candidatesPerTurn: 3,
  /** A topic untouched this long counts as "returned to" (weight 1.5). */
  returnedAfterMs: 7 * 24 * 60 * 60_000,
  /** Newest claims kept per kind (TOPIC-DATA-01 keeps state bounded). */
  claimLimits: {
    decision: 3,
    next_step: 3,
    open_question: 5,
  } satisfies Record<TopicClaimKind, number>,
  /** Existing topics shown to the formation model. */
  formationTopicLimit: 8,
  /** State statements shown per topic, newest first; all are resolvable. */
  formationStatePerTopic: 8,
  /** Debounce after a turn before formation runs (TOPIC-FORM-01). */
  formationDelayMs: 2 * 60_000,
  /** Characters of each message the formation model reads. */
  formationMessageChars: 1200,
} as const;

/** Salience event weights (TOPIC-RANK-01). Sydia's own mentions never count. */
export const TOPIC_EVENT_WEIGHTS = {
  assigned: 1,
  returned: 1.5,
  item_edit: 0.5,
  disconnect: -1,
} as const;
