import { billingTestAccess } from '../../../test/support/billing-fixtures';
import { describe, expect, jest, test } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AssistancePreference } from '../../database/entities';
import type {
  IConversationRepository,
  INotificationRepository,
  ITaskRepository,
  NotificationSchedulingTarget,
  ProactiveWork,
} from '../../database/interfaces';
import type { AssistancePolicyService } from '../secretary/assistance-policy.service';
import type { QueueService } from '../../infra/queue';
import { ProactiveSchedulerService } from './proactive-scheduler.service';

function setup(
  interval: number,
  notifiable = true,
  overrides: Partial<NotificationSchedulingTarget> = {},
  dueIndex: { work?: ProactiveWork[]; legacy?: boolean } = {},
) {
  const target: NotificationSchedulingTarget = {
    userId: 'owner',
    timezone: 'Asia/Makassar',
    briefingEnabled: true,
    weeklyBriefingEnabled: true,
    weeklyBriefingDay: 1,
    briefingTime: '08:00',
    followUpIntervalMinutes: interval,
    notifiable,
    ...overrides,
  };

  const index = {
    discardOrphanProactiveChanges: jest
      .fn<INotificationRepository['discardOrphanProactiveChanges']>()
      .mockResolvedValue(0),
    listProactiveWork: jest
      .fn<INotificationRepository['listProactiveWork']>()
      .mockResolvedValueOnce(dueIndex.work ?? [])
      .mockResolvedValue([]),
    completeProactiveWork: jest
      .fn<INotificationRepository['completeProactiveWork']>()
      .mockResolvedValue(),
    listSendTimesSince: jest
      .fn<INotificationRepository['listSendTimesSince']>()
      .mockResolvedValue([]),
  };

  const repository = {
    listSchedulingTargets: () =>
      Promise.resolve(dueIndex.legacy === false ? [] : [target]),
    ...index,
  } as unknown as INotificationRepository;

  const earliestInboxDueAt = jest
    .fn<ITaskRepository['earliestInboxDueAt']>()
    .mockResolvedValue(null);

  const findLatestUserMessageAt = jest
    .fn<IConversationRepository['findLatestUserMessageAt']>()
    .mockResolvedValue(null);

  const preference = jest
    .fn<AssistancePolicyService['preference']>()
    .mockResolvedValue(null);

  const jobs = new Set<string>();
  const add = jest
    .fn<
      (name: string, data: unknown, options: { jobId: string }) => Promise<void>
    >()
    .mockImplementation((_name, _data, options) => {
      jobs.add(options.jobId);

      return Promise.resolve();
    });

  const queue = { getJob: (id: string) => Promise.resolve(jobs.has(id)), add };
  const queues = {
    briefings: queue,
    followUps: queue,
  } as unknown as QueueService;

  return {
    service: new ProactiveSchedulerService(
      billingTestAccess(),
      repository,
      queues,
      new ConfigService(),
      { earliestInboxDueAt } as unknown as ITaskRepository,
      { findLatestUserMessageAt } as unknown as IConversationRepository,
      { preference } as unknown as AssistancePolicyService,
    ),
    add,
    index,
    earliestInboxDueAt,
    preference,
  };
}

test.each([
  [30, '2026-10-15T02:30:00Z'],
  [60, '2026-10-15T03:00:00Z'],
  [120, '2026-10-15T04:00:00Z'],
  [180, '2026-10-15T04:00:00Z'],
])(
  'dispatches follow-ups again at the next %i-minute interval',
  async (interval, next) => {
    const { service, add } = setup(Number(interval));
    await service.sweepFollowUps(new Date('2026-10-15T02:00:00Z'));
    await service.sweepFollowUps(new Date('2026-10-15T02:05:00Z'));
    expect(add).toHaveBeenCalledTimes(1);
    await service.sweepFollowUps(new Date(next));
    expect(add).toHaveBeenCalledTimes(2);
  },
);

test('keeps daily briefings deduplicated within their morning window', async () => {
  const { service, add } = setup(30);
  await service.sweepBriefings(new Date('2026-10-15T00:00:00Z'));
  await service.sweepBriefings(new Date('2026-10-15T00:05:00Z'));
  expect(add).toHaveBeenCalledTimes(1);
});

test('skips follow-ups when external notification channels are disabled', async () => {
  const { service, add } = setup(60, false);
  await service.sweepFollowUps(new Date('2026-10-15T02:00:00Z'));
  expect(add).not.toHaveBeenCalled();
});

test.each(['2026-10-15T14:00:00Z', '2026-10-15T18:00:00Z'])(
  'dispatches follow-ups overnight at %s (no quiet hours)',
  async (instant) => {
    const { service, add } = setup(30);
    await service.sweepFollowUps(new Date(instant));
    expect(add).toHaveBeenCalledTimes(1);
  },
);

test('weekly-only briefing uses the shared time on the selected local weekday', async () => {
  const { service, add } = setup(60, true, {
    briefingEnabled: false,
    briefingTime: '09:15',
  });

  await service.sweepBriefings(new Date('2026-10-19T01:15:00Z'));
  expect(add).toHaveBeenCalledWith(
    'briefing',
    {
      kind: 'user',
      userId: 'owner',
      at: '2026-10-19T01:15:00.000Z',
      source: 'legacy',
    },
    { jobId: 'briefing-owner-2026-10-19' },
  );
});

test('weekly-only briefing is skipped on another weekday', async () => {
  const { service, add } = setup(60, true, { briefingEnabled: false });
  await service.sweepBriefings(new Date('2026-10-20T00:00:00Z'));
  expect(add).not.toHaveBeenCalled();
});

test('daily and weekly share one job identity across repeated weekly-day sweeps', async () => {
  const { service, add } = setup(60);
  await service.sweepBriefings(new Date('2026-10-19T00:00:00Z'));
  await service.sweepBriefings(new Date('2026-10-19T00:05:00Z'));
  expect(add).toHaveBeenCalledTimes(1);
});

test('both briefing switches off suppress the weekly day', async () => {
  const { service, add } = setup(60, true, {
    briefingEnabled: false,
    weeklyBriefingEnabled: false,
  });

  await service.sweepBriefings(new Date('2026-10-19T00:00:00Z'));
  expect(add).not.toHaveBeenCalled();
});

test('a late briefing time is honored on the selected weekday (no quiet hours)', async () => {
  const { service, add } = setup(60, true, {
    briefingEnabled: false,
    briefingTime: '23:00',
  });

  await service.sweepBriefings(new Date('2026-10-19T15:00:00Z'));
  expect(add).toHaveBeenCalledWith(
    'briefing',
    {
      kind: 'user',
      userId: 'owner',
      at: '2026-10-19T15:00:00.000Z',
      source: 'legacy',
    },
    { jobId: 'briefing-owner-2026-10-19' },
  );
});

describe('proactive due index', () => {
  // Asia/Makassar is UTC+8: 2026-10-15T00:00Z is 08:00 local on a Thursday.
  const at = (iso: string) => new Date(iso);

  function work(overrides: Partial<ProactiveWork> = {}): ProactiveWork {
    return {
      userId: 'owner',
      timezone: 'Asia/Makassar',
      banned: false,
      briefingEnabled: true,
      weeklyBriefingEnabled: false,
      weeklyBriefingDay: 1,
      briefingTime: '08:00',
      followUpIntervalMinutes: 60,
      notifiable: true,
      changeIds: ['3'],
      ...overrides,
    };
  }

  function dueSetup(item: ProactiveWork) {
    return setup(item.followUpIntervalMinutes, true, item, { work: [item] });
  }

  test('queues a due briefing first, so the legacy sweep adds nothing', async () => {
    const { service, add, index } = dueSetup(work());
    await service.sweepBriefings(at('2026-10-15T00:00:00Z'));

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      'briefing',
      expect.objectContaining({ source: 'due_index' }),
      { jobId: 'briefing-owner-2026-10-15' },
    );
    expect(index.completeProactiveWork).toHaveBeenCalledWith(
      'briefing',
      'owner',
      ['3'],
      at('2026-10-16T00:00:00Z'),
    );
  });

  test('a briefing later today is stored, not queued', async () => {
    const { service, index } = setup(
      60,
      true,
      {},
      {
        work: [work()],
        legacy: false,
      },
    );

    await service.sweepBriefings(at('2026-10-14T22:00:00Z'));
    expect(index.completeProactiveWork).toHaveBeenCalledWith(
      'briefing',
      'owner',
      ['3'],
      at('2026-10-15T00:00:00Z'),
    );
  });

  test('a weekly-only briefing is next due on its weekday', async () => {
    const item = work({ briefingEnabled: false, weeklyBriefingEnabled: true });
    const { service, index } = setup(60, true, item, {
      work: [item],
      legacy: false,
    });

    await service.sweepBriefings(at('2026-10-15T02:00:00Z'));
    // Next Monday, 2026-10-19 08:00 local.
    expect(index.completeProactiveWork).toHaveBeenCalledWith(
      'briefing',
      'owner',
      ['3'],
      at('2026-10-19T00:00:00Z'),
    );
  });

  test('no briefing day and banned accounts leave the index', async () => {
    const off = work({ briefingEnabled: false, weeklyBriefingEnabled: false });
    const disabled = setup(60, true, off, { work: [off], legacy: false });
    await disabled.service.sweepBriefings(at('2026-10-15T00:00:00Z'));
    expect(disabled.index.completeProactiveWork).toHaveBeenCalledWith(
      'briefing',
      'owner',
      ['3'],
      null,
    );

    const banned = setup(
      60,
      true,
      {},
      {
        work: [work({ banned: true })],
        legacy: false,
      },
    );

    await banned.service.sweepBriefings(at('2026-10-15T00:00:00Z'));
    expect(banned.add).not.toHaveBeenCalled();
    expect(banned.index.completeProactiveWork).toHaveBeenCalledWith(
      'briefing',
      'owner',
      ['3'],
      null,
    );
  });

  test('a due task queues a follow-up and the next slot is stored', async () => {
    const { service, add, index, earliestInboxDueAt } = dueSetup(work());
    earliestInboxDueAt.mockResolvedValue(at('2026-10-14T00:00:00Z'));

    await service.sweepFollowUps(at('2026-10-15T02:10:00Z'));
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      'follow-up',
      expect.objectContaining({ source: 'due_index' }),
      { jobId: 'follow_up-owner-2026-10-15-60-10' },
    );
    expect(index.completeProactiveWork).toHaveBeenCalledWith(
      'follow_up',
      'owner',
      ['3'],
      at('2026-10-15T03:00:00Z'),
    );
  });

  test('a future task is due at the first slot after it', async () => {
    const item = work();
    const { service, add, index, earliestInboxDueAt } = setup(60, true, item, {
      work: [item],
      legacy: false,
    });

    earliestInboxDueAt.mockResolvedValue(at('2026-10-15T05:20:00Z'));
    await service.sweepFollowUps(at('2026-10-15T02:00:00Z'));
    expect(add).not.toHaveBeenCalled();
    expect(index.completeProactiveWork).toHaveBeenCalledWith(
      'follow_up',
      'owner',
      ['3'],
      at('2026-10-15T06:00:00Z'),
    );
  });

  test('no open task or an open-ended pause leaves the follow-up index', async () => {
    const noTasks = setup(60, true, {}, { work: [work()], legacy: false });
    await noTasks.service.sweepFollowUps(at('2026-10-15T02:00:00Z'));
    expect(noTasks.index.completeProactiveWork).toHaveBeenCalledWith(
      'follow_up',
      'owner',
      ['3'],
      null,
    );

    const paused = setup(60, true, {}, { work: [work()], legacy: false });
    paused.earliestInboxDueAt.mockResolvedValue(at('2026-10-14T00:00:00Z'));
    paused.preference.mockResolvedValue({
      pausedAll: true,
      pausedUntil: null,
    } as AssistancePreference);
    await paused.service.sweepFollowUps(at('2026-10-15T02:00:00Z'));
    expect(paused.add).not.toHaveBeenCalled();
    expect(paused.index.completeProactiveWork).toHaveBeenCalledWith(
      'follow_up',
      'owner',
      ['3'],
      null,
    );
  });

  test('a timed pause moves the next follow-up to the first slot after it', async () => {
    const { service, add, index, earliestInboxDueAt, preference } = setup(
      60,
      true,
      {},
      { work: [work()], legacy: false },
    );

    earliestInboxDueAt.mockResolvedValue(at('2026-10-14T00:00:00Z'));
    preference.mockResolvedValue({
      pausedAll: true,
      pausedUntil: at('2026-10-15T04:30:00Z'),
    } as AssistancePreference);

    await service.sweepFollowUps(at('2026-10-15T02:00:00Z'));
    expect(add).not.toHaveBeenCalled();
    expect(index.completeProactiveWork).toHaveBeenCalledWith(
      'follow_up',
      'owner',
      ['3'],
      at('2026-10-15T05:00:00Z'),
    );
  });

  test('the back-off sets the next follow-up slot', async () => {
    const { service, index, earliestInboxDueAt } = setup(
      60,
      true,
      {},
      { work: [work()], legacy: false },
    );

    earliestInboxDueAt.mockResolvedValue(at('2026-10-14T00:00:00Z'));
    // One unanswered follow-up at 01:30: the next may go at 03:30, slot 04:00.
    index.listSendTimesSince.mockResolvedValue([at('2026-10-15T01:30:00Z')]);
    await service.sweepFollowUps(at('2026-10-15T02:00:00Z'));
    expect(index.completeProactiveWork).toHaveBeenCalledWith(
      'follow_up',
      'owner',
      ['3'],
      at('2026-10-15T04:00:00Z'),
    );
  });

  test('a send from a legacy-queued job is reported as a due-index miss', () => {
    const { service } = setup(60);
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const job = { userId: 'owner', at: '2026-10-15T00:00:00.000Z' };

    service.reportLegacySend(
      'briefing',
      { ...job, source: 'due_index' },
      {
        status: 'queued',
      },
    );
    service.reportLegacySend(
      'briefing',
      { ...job, source: 'legacy' },
      {
        status: 'queued',
        replayed: true,
      },
    );
    service.reportLegacySend(
      'follow_up',
      { ...job, source: 'legacy' },
      {
        status: 'nothing_due',
      },
    );
    expect(warn).not.toHaveBeenCalled();

    service.reportLegacySend(
      'follow_up',
      { ...job, source: 'legacy' },
      {
        status: 'queued',
        replayed: false,
      },
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"event":"reminder_due_index_miss"'),
    );
    warn.mockRestore();
  });
});
