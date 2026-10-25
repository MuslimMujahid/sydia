import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CONVERSATION_REPOSITORY,
  NOTIFICATION_REPOSITORY,
  USER_REPOSITORY,
  type IConversationRepository,
  type INotificationRepository,
  type IUserRepository,
} from '../../database/interfaces';
import { BillingAccessService } from '../billing';
import { CalendarReadService } from '../calendar/calendar-read.service';
import { AssistantOrchestratorService } from '../conversations/services/assistant-orchestrator.service';
import {
  ASSISTANCE_POLICY,
  AssistancePolicyService,
  AssistantActionService,
  SECRETARY_CLOCK,
  type SecretaryClock,
} from '../secretary';
import {
  localDate,
  localDateTime,
  localDayStart,
} from '../secretary/local-time';

export const SECRETARY_DELIVERY_KIND = 'secretary';
/** Named finite background budgets (FAIL-01). */
export const BACKGROUND_BUDGET = {
  usersPerSweep: 200,
  evaluationsPerUser: 6,
  timeoutMs: 90_000,
} as const;

export type BackgroundOutcome =
  'surface_in_chat' | 'notify_now' | 'defer' | 'suppress' | 'failed';

export type BackgroundDecision = {
  userId: string;
  opportunity: string;
  outcome: BackgroundOutcome;
  reason: string;
  messageId?: string;
  loadedSkills?: Record<string, string>;
};

/**
 * Turns timers into opportunities for the same conversational agent. Hard
 * gates (billing, pause, quiet hours, budget, deduplication) run here, outside
 * the model; the agent decides whether anything useful should be said.
 */
@Injectable()
export class SecretaryBackgroundService {
  private readonly logger = new Logger(SecretaryBackgroundService.name);

  constructor(
    private readonly billing: BillingAccessService,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: INotificationRepository,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly calendar: CalendarReadService,
    private readonly orchestrator: AssistantOrchestratorService,
    private readonly policy: AssistancePolicyService,
    private readonly actions: AssistantActionService,
    @Inject(SECRETARY_CLOCK) private readonly clock: SecretaryClock,
  ) {}

  async sweep(
    now = this.clock.now(),
    onlyUserId?: string,
  ): Promise<BackgroundDecision[]> {
    const targets = (await this.notifications.listSchedulingTargets())
      .filter((target) => !onlyUserId || target.userId === onlyUserId)
      .slice(0, BACKGROUND_BUDGET.usersPerSweep);

    const decisions: BackgroundDecision[] = [];

    for (const target of targets) {
      try {
        decisions.push(...(await this.evaluateUser(target.userId, now)));
      } catch (error) {
        this.logger.error(
          JSON.stringify({
            event: 'secretary_background_failed',
            userId: target.userId,
            errorName: error instanceof Error ? error.name : 'UnknownError',
            remediation:
              'Background evaluation failed; the opportunity stays eligible for the next sweep.',
          }),
          error instanceof Error ? error.stack : undefined,
        );
        decisions.push({
          userId: target.userId,
          opportunity: 'sweep',
          outcome: 'failed',
          reason: 'evaluation_error',
        });
      }
    }

    for (const decision of decisions)
      this.logger.log(
        JSON.stringify({
          event: 'secretary_background_decision',
          policyVersion: ASSISTANCE_POLICY.version,
          occurredAt: now.toISOString(),
          ...decision,
        }),
      );

    return decisions;
  }

  private async evaluateUser(
    userId: string,
    now: Date,
  ): Promise<BackgroundDecision[]> {
    if (!(await this.billing.isActive(userId))) return [];
    const user = await this.users.findById(userId);
    if (!user) return [];

    const opportunities = await this.opportunities(userId, user.timezone, now);
    if (!opportunities.length) return [];
    const decisions: BackgroundDecision[] = [];

    let evaluations = 0;

    for (const opportunity of opportunities) {
      // One unsolicited message per sweep; evaluations stay within a finite budget.
      if (decisions.some((decision) => decision.outcome === 'surface_in_chat'))
        break;

      if (evaluations >= BACKGROUND_BUDGET.evaluationsPerUser) {
        decisions.push({
          userId,
          opportunity: opportunity.key,
          outcome: 'defer',
          reason: 'evaluation_budget',
        });
        break;
      }

      const idempotencyKey = `secretary:${opportunity.key}`;
      const existing = await this.notifications.findDeliveryByIdempotencyKey(
        userId,
        idempotencyKey,
        'web',
      );

      if (existing) continue;

      const gate = await this.policy.unsolicitedAllowed(
        userId,
        opportunity.behavior,
        now,
      );

      if (!gate.allowed) {
        decisions.push({
          userId,
          opportunity: opportunity.key,
          outcome: 'suppress',
          reason: gate.reason,
        });
        continue;
      }

      const quietUntil = await this.policy.quietUntil(userId, now);

      if (quietUntil) {
        decisions.push({
          userId,
          opportunity: opportunity.key,
          outcome: 'defer',
          reason: `quiet_hours_until_${quietUntil.toISOString()}`,
        });
        continue;
      }

      const dayStart = localDayStart(
        localDate(now, user.timezone),
        user.timezone,
      );

      const used = await this.notifications.countDeliveriesSince(
        userId,
        SECRETARY_DELIVERY_KIND,
        dayStart,
        ['delivered', 'pending', 'processing'],
      );

      if (used >= ASSISTANCE_POLICY.dailyOutreachLimit) {
        decisions.push({
          userId,
          opportunity: opportunity.key,
          outcome: 'defer',
          reason: 'daily_outreach_budget',
        });
        continue;
      }

      const conversationId =
        await this.conversations.findLatestConversationId(userId);

      if (!conversationId) {
        decisions.push({
          userId,
          opportunity: opportunity.key,
          outcome: 'suppress',
          reason: 'no_existing_conversation',
        });
        continue;
      }

      evaluations += 1;
      const alreadySent = await this.notifications.listDeliveredContentSince(
        userId,
        SECRETARY_DELIVERY_KIND,
        dayStart,
        3,
      );

      const evaluationId = `bg-${createHash('sha256').update(`${idempotencyKey}:${randomUUID()}`).digest('hex').slice(0, 24)}`;
      const abort = AbortSignal.timeout(BACKGROUND_BUDGET.timeoutMs);
      const result = await this.orchestrator.evaluateBackground({
        user,
        conversationId,
        evaluationId,
        trigger: `${opportunity.trigger}${alreadySent.length ? `\nAlready sent to this user today (do not repeat this help in other words): ${alreadySent.map((content) => JSON.stringify(content.slice(0, 400))).join(' | ')}` : ''}`,
        now,
        abortSignal: abort,
      });

      if (!result.text) {
        // Durable no-action marker prevents a self-sustaining re-evaluation loop.
        await this.notifications
          .createDelivery({
            userId,
            kind: SECRETARY_DELIVERY_KIND,
            content: '',
            idempotencyKey,
            channel: 'web',
            proactive: true,
            sourceId: opportunity.sourceId,
          })
          .then((delivery) =>
            this.notifications.updateDelivery(userId, delivery.id, {
              status: 'skipped_obsolete',
              policyOutcome: `no_action:${result.reason}`.slice(0, 120),
            }),
          );
        decisions.push({
          userId,
          opportunity: opportunity.key,
          outcome: 'suppress',
          reason: result.reason,
          loadedSkills: result.loadedSkills,
        });
        continue;
      }

      const delivery = await this.notifications.createDelivery({
        userId,
        kind: SECRETARY_DELIVERY_KIND,
        content: result.text,
        idempotencyKey,
        channel: 'web',
        proactive: true,
        sourceId: opportunity.sourceId,
      });

      const message = await this.conversations.appendAssistantMessage(
        userId,
        conversationId,
        result.text,
      );

      await this.notifications.updateDelivery(userId, delivery.id, {
        status: 'delivered',
        providerMessageId: message.id,
        deliveredAt: this.clock.now(),
        attemptedAt: this.clock.now(),
        policyOutcome: 'surface_in_chat',
      });
      if (result.preparedActionIds.length)
        await this.actions.markOffered(
          userId,
          evaluationId,
          message.id,
          result.preparedActionIds,
        );

      decisions.push({
        userId,
        opportunity: opportunity.key,
        outcome: 'surface_in_chat',
        reason: 'useful',
        messageId: message.id,
        loadedSkills: result.loadedSkills,
      });
    }

    return decisions;
  }

  /** Timely meeting-preparation windows; the agent still judges usefulness. */
  private async opportunities(userId: string, timezone: string, now: Date) {
    const from = new Date(
      now.getTime() + ASSISTANCE_POLICY.preparationWindowMs.to,
    );

    const to = new Date(
      now.getTime() + ASSISTANCE_POLICY.preparationWindowMs.from,
    );

    const events = await this.calendar.list(userId, from, to);

    return events
      .filter(
        (event) =>
          event.status !== 'cancelled' &&
          event.startAt &&
          event.startAt >= from &&
          event.startAt <= to,
      )
      .map((event) => ({
        key: `prep:${userId}:${event.id}:${event.startAt!.toISOString()}:r${event.revision}`,
        sourceId: event.id,
        behavior: 'meeting_preparation' as const,
        trigger: `Upcoming calendar event "${event.title}" at ${localDateTime(event.startAt!, timezone)}–${localDateTime(event.endAt!, timezone).slice(11)} (${timezone}), event id ${event.id}, status ${event.status}. Consider meeting preparation for related unfinished work.`,
      }));
  }
}
