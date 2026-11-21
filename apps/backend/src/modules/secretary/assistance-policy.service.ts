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
import { localDateTime } from './local-time';
import { schedulingInstant } from './scheduling';
import { SECRETARY_CLOCK, type SecretaryClock } from './secretary-clock';

/** Built-in v1 policy values (POLICY-02); not a user-facing settings surface. */
export const ASSISTANCE_POLICY = {
  version: 'assistance-v1',
  briefingItemLimit: 3,
} as const;

export type PolicyGate = { allowed: true } | { allowed: false; reason: string };

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

  /** Persists a conversational instruction; scope interpretation is the agent's job. */
  async remember(
    userId: string,
    sourceMessageId: string,
    change: {
      pauseAll?: boolean;
      pauseUntil?: string | null;
      pauseBehaviors?: AssistanceBehavior[];
      resumeBehaviors?: AssistanceBehavior[];
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

    const saved = await this.actions.savePreference(userId, {
      ...(change.pauseAll !== undefined ? { pausedAll: change.pauseAll } : {}),
      ...(pausedUntil !== undefined ? { pausedUntil } : {}),
      pausedBehaviors: [...behaviors],
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

    // State only: the suggestion rule itself lives once in the system policy.
    return `Unsolicited suggestions (${ASSISTANCE_POLICY.version}): ${paused}${behaviors}.`;
  }
}
