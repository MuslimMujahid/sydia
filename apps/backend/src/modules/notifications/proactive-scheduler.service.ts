import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NOTIFICATION_REPOSITORY,
  type INotificationRepository,
  type NotificationSchedulingTarget,
} from '../../database/interfaces';
import { QueueService } from '../../infra/queue';
import { dayWindow, isDueInWindow } from '../../shared/date-time';

const DEFAULT_BRIEFING_TIME = '08:00';
const DEFAULT_SWEEP_MINUTES = 5;
const DEFAULT_WINDOW_MINUTES = 30;
/** Follow-ups land in the morning, after the briefing window has closed. */
const DEFAULT_FOLLOW_UP_TIME = '09:00';
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
  private readonly followUpTime: string;

  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: INotificationRepository,
    private readonly queues: QueueService,
    config: ConfigService,
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
    this.followUpTime = config.get<string>(
      'BACKEND_PROACTIVE_FOLLOW_UP_TIME',
      DEFAULT_FOLLOW_UP_TIME,
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

  async sweepBriefings(now = new Date()): Promise<SweepOutcome> {
    return this.sweep('briefing', now, (target) => ({
      due: isDueInWindow(
        now,
        target.timezone,
        target.briefingTime ?? DEFAULT_BRIEFING_TIME,
        this.windowMinutes,
      ),
      // Only an explicitly disabled preference suppresses a briefing.
      enabled: target.briefingEnabled,
    }));
  }

  async sweepFollowUps(now = new Date()): Promise<SweepOutcome> {
    return this.sweep('follow_up', now, (target) => ({
      due: isDueInWindow(
        now,
        target.timezone,
        this.followUpTime,
        this.windowMinutes,
      ),
      enabled: true,
    }));
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

      if (!enabled || !due || !target.notifiable) {
        skipped += 1;
        continue;
      }

      const date = dayWindow(now, target.timezone).date;
      const jobId = `${kind}-${target.userId}-${date}`;

      // One dispatch per user per day. A day-scoped job id expresses exactly
      // that: it stays reserved after the job finishes, so every later tick in
      // the same window is a no-op, and tomorrow's date mints a fresh id.
      // Retrying a failed send is the queue's concern (attempts with backoff),
      // not the sweep's — re-dispatching here would re-run the generation.
      if (await queue.getJob(jobId)) {
        skipped += 1;
        continue;
      }

      await queue.add(
        kind === 'briefing' ? 'briefing' : 'follow-up',
        { kind: 'user', userId: target.userId, at: now.toISOString() },
        { jobId },
      );
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
}
