import { Inject, Injectable } from '@nestjs/common';
import {
  ASSISTANT_ACTION_REPOSITORY,
  USER_REPOSITORY,
  type IAssistantActionRepository,
  type IUserRepository,
} from '../../database/interfaces';
import {
  ASSISTANCE_BEHAVIORS,
  type AssistanceBehavior,
  type AssistancePreference,
} from '../../database/entities';
import { localDateTime, localTime } from './local-time';
import { schedulingInstant } from './scheduling';
import { SECRETARY_CLOCK, type SecretaryClock } from './secretary-clock';

/** Built-in v1 policy values (POLICY-02); not a user-facing settings surface. */
export const ASSISTANCE_POLICY = {
  version: 'assistance-v1',
  quietStart: '21:00',
  quietEnd: '08:00',
  dailyOutreachLimit: 2,
  briefingItemLimit: 3,
  preparationWindowMs: { from: 24 * 60 * 60_000, to: 30 * 60_000 },
} as const;

export type PolicyGate = { allowed: true } | { allowed: false; reason: string };

function minutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);

  return hour! * 60 + minute!;
}

/** True when a local HH:mm lies in a [start, end) window that may wrap midnight. */
export function inQuietHours(
  time: string,
  start: string,
  end: string,
): boolean {
  const at = minutes(time);
  const from = minutes(start);
  const to = minutes(end);

  return from <= to ? at >= from && at < to : at >= from || at < to;
}

/**
 * Hard gates enforced outside the model. Passing a gate is eligibility, not a
 * reason to surface anything.
 */
@Injectable()
export class AssistancePolicyService {
  constructor(
    @Inject(ASSISTANT_ACTION_REPOSITORY)
    private readonly actions: IAssistantActionRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(SECRETARY_CLOCK) private readonly clock: SecretaryClock,
  ) {}

  preference(userId: string): Promise<AssistancePreference | null> {
    return this.actions.getPreference(userId);
  }

  async unsolicitedAllowed(
    userId: string,
    behavior: AssistanceBehavior,
    now = this.clock.now(),
  ): Promise<PolicyGate> {
    const preference = await this.actions.getPreference(userId);
    if (!preference) return { allowed: true };
    if (
      preference.pausedAll &&
      (!preference.pausedUntil || preference.pausedUntil > now)
    )
      return { allowed: false, reason: 'user_paused_suggestions' };
    if (preference.pausedBehaviors.includes(behavior))
      return { allowed: false, reason: `user_opted_out_${behavior}` };

    return { allowed: true };
  }

  /** Delivery-time quiet-hours gate; returns the first permitted instant when blocked. */
  async quietUntil(
    userId: string,
    now = this.clock.now(),
  ): Promise<Date | null> {
    const [user, preference] = await Promise.all([
      this.users.findById(userId),
      this.actions.getPreference(userId),
    ]);

    if (!user) return null;
    const start = preference?.quietStart ?? ASSISTANCE_POLICY.quietStart;
    const end = preference?.quietEnd ?? ASSISTANCE_POLICY.quietEnd;
    const local = localDateTime(now, user.timezone);
    if (!inQuietHours(localTime(now, user.timezone), start, end)) return null;
    const today = local.slice(0, 10);
    const candidate = schedulingInstant(today, end, user.timezone);

    return candidate > now
      ? candidate
      : new Date(candidate.getTime() + 24 * 60 * 60_000);
  }

  /** Persists a conversational instruction; scope interpretation is the agent's job. */
  async remember(
    userId: string,
    sourceMessageId: string,
    change: {
      pauseAll?: boolean;
      pauseUntil?: string | null;
      pauseBehaviors?: AssistanceBehavior[];
      resumeBehaviors?: AssistanceBehavior[];
      quietStart?: string | null;
      quietEnd?: string | null;
    },
  ): Promise<{ saved: AssistancePreference; policyVersion: string }> {
    const user = await this.users.findById(userId);
    if (!user) throw new Error('Preference change requires an existing owner.');
    const current = await this.actions.getPreference(userId);
    const behaviors = new Set(current?.pausedBehaviors ?? []);

    for (const behavior of change.pauseBehaviors ?? []) {
      if (!ASSISTANCE_BEHAVIORS.includes(behavior))
        throw new Error('Unknown behavior.');
      behaviors.add(behavior);
    }

    for (const behavior of change.resumeBehaviors ?? [])
      behaviors.delete(behavior);

    let pausedUntil: Date | null | undefined;
    if (change.pauseUntil) {
      const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(
        change.pauseUntil,
      );

      if (!match)
        throw new Error('pauseUntil must be local "YYYY-MM-DD HH:mm".');
      pausedUntil = schedulingInstant(match[1]!, match[2]!, user.timezone);
    } else if (change.pauseAll !== undefined) pausedUntil = null;

    for (const value of [change.quietStart, change.quietEnd])
      if (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
        throw new Error('Quiet hours must be HH:mm.');

    const saved = await this.actions.savePreference(userId, {
      ...(change.pauseAll !== undefined ? { pausedAll: change.pauseAll } : {}),
      ...(pausedUntil !== undefined ? { pausedUntil } : {}),
      pausedBehaviors: [...behaviors],
      ...(change.quietStart !== undefined
        ? { quietStart: change.quietStart }
        : {}),
      ...(change.quietEnd !== undefined ? { quietEnd: change.quietEnd } : {}),
      instructionMessageId: sourceMessageId,
    });

    return { saved, policyVersion: ASSISTANCE_POLICY.version };
  }

  describe(
    preference: AssistancePreference | null,
    timezone: string,
    now = this.clock.now(),
  ): string {
    const paused =
      preference?.pausedAll &&
      (!preference.pausedUntil || preference.pausedUntil > now)
        ? `paused by the user${preference.pausedUntil ? ` until ${localDateTime(preference.pausedUntil, timezone)}` : ' until they ask again'}`
        : 'active';

    const behaviors = preference?.pausedBehaviors.length
      ? `; user opted out of: ${preference.pausedBehaviors.join(', ')}`
      : '';

    return `Unsolicited suggestions (${ASSISTANCE_POLICY.version}): ${paused}${behaviors}. At most one unsolicited suggestion per reply. Explicitly requested help always continues. Any change the user asks for (pause, resume, stop or allow a category, quiet hours) takes effect only through set_assistance_preference; never say it changed unless that tool succeeded this turn.`;
  }
}
