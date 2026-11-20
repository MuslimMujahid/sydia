import type { Topic } from '../../database/entities';
import { currentSalience } from './salience';

const DAY_MS = 24 * 60 * 60_000;

/** TOPIC-LIFE-01/02 thresholds (docs/TOPIC_CONTEXT_SPEC.md, section 13). */
export const TOPIC_LIFECYCLE = {
  /** An unconfirmed candidate is dropped after this many calendar days. */
  candidateExpiryDays: 30,
  /** Below this salience an unanchored active topic becomes dormant. */
  dormantBelow: 0.3,
  /** A topic stays active at least this many active days after becoming so. */
  graceActiveDays: 7,
  /** Dormant this many active days without anything pending: dismissed. */
  dismissAfterActiveDays: 60,
  /** Dismissed and untouched this many calendar days: deleted. */
  deleteAfterDays: 365,
  /** Most active topics per owner; the weakest unanchored ones go dormant. */
  activeCap: 50,
} as const;

export type LifecycleChange =
  | { kind: 'delete'; reason: 'candidate_expired' | 'dismissed_expired' }
  | {
      kind: 'status';
      status: 'dormant' | 'dismissed';
      dismissedReason?: 'inactive';
    };

/**
 * One topic's lifecycle step, or null to leave it. `anchored` means a linked
 * reminder, task or event is still pending: such a topic never moves down.
 * Reactivation is not here; formation does it when the user comes back.
 */
export function lifecycleChange(
  topic: Pick<
    Topic,
    | 'status'
    | 'salience'
    | 'salienceAtActiveDay'
    | 'statusAtActiveDay'
    | 'lastActiveAt'
    | 'createdAt'
  >,
  context: { activeDay: number; now: Date; anchored: boolean },
): LifecycleChange | null {
  const days = (since: Date) =>
    (context.now.getTime() - since.getTime()) / DAY_MS;

  const activeDaysInStatus = context.activeDay - topic.statusAtActiveDay;

  switch (topic.status) {
    case 'candidate':
      return days(topic.createdAt) > TOPIC_LIFECYCLE.candidateExpiryDays
        ? { kind: 'delete', reason: 'candidate_expired' }
        : null;
    case 'active':
      return !context.anchored &&
        activeDaysInStatus >= TOPIC_LIFECYCLE.graceActiveDays &&
        currentSalience(topic, context.activeDay) < TOPIC_LIFECYCLE.dormantBelow
        ? { kind: 'status', status: 'dormant' }
        : null;
    case 'dormant':
      return !context.anchored &&
        activeDaysInStatus >= TOPIC_LIFECYCLE.dismissAfterActiveDays
        ? { kind: 'status', status: 'dismissed', dismissedReason: 'inactive' }
        : null;
    case 'dismissed':
      return days(topic.lastActiveAt) > TOPIC_LIFECYCLE.deleteAfterDays
        ? { kind: 'delete', reason: 'dismissed_expired' }
        : null;
  }
}

/**
 * Active topics over the cap, weakest first, never one with a pending item
 * (TOPIC-LIFE-02). They become dormant.
 */
export function overCap(
  active: ReadonlyArray<
    Pick<Topic, 'id' | 'salience' | 'salienceAtActiveDay'> & {
      anchored: boolean;
    }
  >,
  activeDay: number,
  cap: number = TOPIC_LIFECYCLE.activeCap,
): string[] {
  const excess = active.length - cap;
  if (excess <= 0) return [];

  return active
    .filter((topic) => !topic.anchored)
    .sort(
      (a, b) => currentSalience(a, activeDay) - currentSalience(b, activeDay),
    )
    .slice(0, excess)
    .map((topic) => topic.id);
}
