import { BillingAccessService } from '../billing';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CONVERSATION_REPOSITORY,
  NOTIFICATION_REPOSITORY,
  TASK_REPOSITORY,
  type IConversationRepository,
  type INotificationRepository,
  type ITaskRepository,
  type NotificationSchedulingTarget,
  type ProactiveLane,
  type ProactiveWork,
} from '../../database/interfaces';
import { QueueService, type ProactiveJobSource } from '../../infra/queue';
import { dayWindow, isDueInWindow } from '../../shared/date-time';
import { AssistancePolicyService } from '../secretary/assistance-policy.service';
import {
  followUpIntervalKey,
  followUpSlotAtOrAfter,
} from './follow-up-interval';
import {
  briefingDay,
  isWeeklyBriefingDay,
  nextBriefingAt,
} from './briefing-schedule';
import { followUpAttention } from './proactive.service';

const DEFAULT_BRIEFING_TIME = '08:00';
const DEFAULT_SWEEP_MINUTES = 5;
const DEFAULT_WINDOW_MINUTES = 30;
const DUE_INDEX_BATCH_SIZE = 100;
const DUE_INDEX_MAX_FAILURES = 20;
export type SweepOutcome = {
  kind: 'briefing' | 'follow_up';
  considered: number;
  dispatched: number;
  skipped: number;
};

/**
 * Feeds the `briefings` and `follow-ups` queues.
 *
 * A single repeatable tick sweeps every user instead of pinning one job per
 * user at their own local time. That keeps the schedule correct across
 * timezones and DST, makes a changed preference take effect on the next tick
 * with no re-registration, and lets a window decide whether a user is due.
 */
@Injectable()
export class ProactiveSchedulerService {
  private readonly logger = new Logger(ProactiveSchedulerService.name);
  private readonly sweepMs: number;
  private readonly windowMinutes: number;

  constructor(
    private readonly billing: BillingAccessService,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: INotificationRepository,
    private readonly queues: QueueService,
    config: ConfigService,
    @Inject(TASK_REPOSITORY) private readonly tasks: ITaskRepository,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    private readonly policy: AssistancePolicyService,
  ) {
    const sweepMinutes = config.get<number>(
      'BACKEND_PROACTIVE_SWEEP_MINUTES',
      DEFAULT_SWEEP_MINUTES,
    );

    this.sweepMs = Math.max(1, sweepMinutes) * 60_000;
    this.windowMinutes = config.get<number>(
      'BACKEND_PROACTIVE_WINDOW_MINUTES',
      DEFAULT_WINDOW_MINUTES,
    );
  }

  /** Registers the repeatable ticks. Idempotent, so every process may call it. */
  async register(): Promise<void> {
    await this.queues.briefings.upsertJobScheduler(
      'briefing-sweep',
      { every: this.sweepMs },
      { name: 'sweep', data: { kind: 'sweep' } },
    );
    await this.queues.followUps.upsertJobScheduler(
      'follow-up-sweep',
      { every: this.sweepMs },
      { name: 'sweep', data: { kind: 'sweep' } },
    );
  }

  /**
   * One briefing tick. The due index (docs/REMINDER_DUE_INDEX_PLAN.md) runs
   * first; the legacy sweep over every user still runs as the shadow safety
   * net. A legacy-queued job that sends is reported as a due-index miss by
   * reportLegacySend. A due-index failure never stops the sweep.
   */
  async sweepBriefings(now = new Date()): Promise<SweepOutcome> {
    await this.runDueIndex('briefing', now);

    return this.sweep('briefing', now, (target) => ({
      due: isDueInWindow(
        now,
        target.timezone,
        target.briefingTime ?? DEFAULT_BRIEFING_TIME,
        this.windowMinutes,
      ),
      enabled:
        target.briefingEnabled ||
        (target.weeklyBriefingEnabled &&
          isWeeklyBriefingDay(now, target.timezone, target.weeklyBriefingDay)),
    }));
  }

  /** One follow-up tick: due index first, then the legacy sweep (see above). */
  async sweepFollowUps(now = new Date()): Promise<SweepOutcome> {
    await this.runDueIndex('follow_up', now);

    return this.sweep('follow_up', now, () => ({ due: true, enabled: true }));
  }

  private async sweep(
    kind: 'briefing' | 'follow_up',
    now: Date,
    eligibility: (target: NotificationSchedulingTarget) => {
      due: boolean;
      enabled: boolean;
    },
  ): Promise<SweepOutcome> {
    const targets = await this.notifications.listSchedulingTargets();
    const queue =
      kind === 'briefing' ? this.queues.briefings : this.queues.followUps;

    let dispatched = 0;
    let skipped = 0;

    for (const target of targets) {
      const { due, enabled } = eligibility(target);

      if (
        !enabled ||
        !due ||
        !target.notifiable ||
        !(await this.billing.isActive(target.userId))
      ) {
        skipped += 1;
        continue;
      }

      const period =
        kind === 'briefing'
          ? dayWindow(now, target.timezone).date
          : followUpIntervalKey(
              now,
              target.timezone,
              target.followUpIntervalMinutes,
            );

      const jobId = `${kind}-${target.userId}-${period}`;

      // Retain the job identity for the whole period so repeated sweeps and
      // retries cannot dispatch the same briefing or follow-up twice.
      if (await queue.getJob(jobId)) {
        skipped += 1;
        continue;
      }

      await this.enqueue(kind, target, now, 'legacy');
      dispatched += 1;
    }

    this.logger.log(
      JSON.stringify({
        event: 'proactive_sweep',
        kind,
        candidates: targets.length,
        dispatched,
        skipped,
        windowMinutes: this.windowMinutes,
      }),
    );

    return { kind, considered: targets.length, dispatched, skipped };
  }

  /**
   * Called with the result of a queued briefing or follow-up. A job the
   * legacy sweep queued that actually sent means the due index missed it.
   */
  reportLegacySend<T extends { status: string; replayed?: boolean }>(
    kind: ProactiveLane,
    job: { userId: string; at: string; source?: ProactiveJobSource },
    result: T,
  ): T {
    if (
      job.source === 'legacy' &&
      result.status === 'queued' &&
      !result.replayed
    )
      this.logger.warn(
        JSON.stringify({
          event: 'reminder_due_index_miss',
          kind,
          userId: job.userId,
          at: job.at,
          remediation:
            'The due index did not queue this send; the legacy sweep did. Find the missed schedule change before removing the sweep.',
        }),
      );

    return result;
  }

  /**
   * Schedules users in one lane whose change marks exist or whose due time
   * has passed, then stores when they next need work. Cost follows the
   * number of users with work, not the number of users.
   */
  private async runDueIndex(lane: ProactiveLane, now: Date): Promise<void> {
    const failures: unknown[] = [];

    try {
      await this.notifications.discardOrphanProactiveChanges();
      let afterUserId: string | null = null;

      do {
        const work = await this.notifications.listProactiveWork(
          lane,
          now,
          afterUserId,
          DUE_INDEX_BATCH_SIZE,
        );

        for (const item of work) {
          try {
            await (lane === 'briefing'
              ? this.scheduleBriefing(item, now)
              : this.scheduleFollowUp(item, now));
          } catch (error: unknown) {
            this.logger.error(
              `The ${lane} due index could not schedule user ${item.userId}; the next tick retries and the legacy sweep still runs.`,
              error instanceof Error ? error.stack : String(error),
            );
            failures.push(error);
            if (failures.length >= DUE_INDEX_MAX_FAILURES)
              throw new AggregateError(
                failures,
                `The ${lane} due index exceeded its failure budget.`,
              );
          }
        }

        afterUserId =
          work.length === DUE_INDEX_BATCH_SIZE
            ? work[work.length - 1]!.userId
            : null;
      } while (afterUserId);
    } catch (error: unknown) {
      this.logger.error(
        `The ${lane} due index stopped this tick; the legacy sweep still runs.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async scheduleBriefing(work: ProactiveWork, now: Date) {
    if (work.banned) return this.complete('briefing', work, null);
    const time = work.briefingTime ?? DEFAULT_BRIEFING_TIME;

    if (
      isDueInWindow(now, work.timezone, time, this.windowMinutes) &&
      briefingDay(now, work.timezone, work) &&
      work.notifiable &&
      (await this.billing.isActive(work.userId))
    )
      await this.enqueue('briefing', work, now, 'due_index');

    await this.complete(
      'briefing',
      work,
      nextBriefingAt(now, work.timezone, time, work),
    );
  }

  private async scheduleFollowUp(work: ProactiveWork, now: Date) {
    if (work.banned) return this.complete('follow_up', work, null);
    const preference = await this.policy.preference(work.userId);
    const paused = Boolean(
      preference?.pausedAll &&
      (!preference.pausedUntil || preference.pausedUntil > now),
    );

    const pausedUntil = paused ? (preference?.pausedUntil ?? null) : null;
    // Paused until the user resumes: the resume itself marks the user.
    if (paused && !pausedUntil) return this.complete('follow_up', work, null);

    const earliest = await this.tasks.earliestInboxDueAt(work.userId);
    // No open task with a due time: a task change marks the user.
    if (!earliest) return this.complete('follow_up', work, null);
    const dueNow = earliest <= now;

    if (
      dueNow &&
      !paused &&
      work.notifiable &&
      (await this.billing.isActive(work.userId))
    )
      await this.enqueue('follow_up', work, now, 'due_index');

    let at = dueNow ? now.getTime() : earliest.getTime();
    if (pausedUntil) at = Math.max(at, pausedUntil.getTime());

    if (dueNow) {
      const { allowedAt } = await followUpAttention(
        this.notifications,
        this.conversations,
        {
          userId: work.userId,
          timezone: work.timezone,
          intervalMinutes: work.followUpIntervalMinutes,
          now,
        },
      );

      at = Math.max(at, allowedAt.getTime());
    }

    await this.complete(
      'follow_up',
      work,
      followUpSlotAtOrAfter(
        new Date(Math.max(at, now.getTime() + 1)),
        work.timezone,
        work.followUpIntervalMinutes,
      ),
    );
  }

  private complete(
    lane: ProactiveLane,
    work: ProactiveWork,
    dueAt: Date | null,
  ) {
    return this.notifications.completeProactiveWork(
      lane,
      work.userId,
      work.changeIds,
      dueAt,
    );
  }

  /**
   * Queues a user's briefing or follow-up for the current period under the
   * period's job id, so the due index and the legacy sweep can never queue
   * it twice. `source` records which path queued it first.
   */
  private async enqueue(
    kind: ProactiveLane,
    target: Pick<
      NotificationSchedulingTarget,
      'userId' | 'timezone' | 'followUpIntervalMinutes'
    >,
    now: Date,
    source: ProactiveJobSource,
  ): Promise<void> {
    const period =
      kind === 'briefing'
        ? dayWindow(now, target.timezone).date
        : followUpIntervalKey(
            now,
            target.timezone,
            target.followUpIntervalMinutes,
          );

    const data = {
      kind: 'user' as const,
      userId: target.userId,
      at: now.toISOString(),
      source,
    };

    const jobId = `${kind}-${target.userId}-${period}`;

    await (kind === 'briefing'
      ? this.queues.briefings.add('briefing', data, { jobId })
      : this.queues.followUps.add('follow-up', data, { jobId }));
  }
}
