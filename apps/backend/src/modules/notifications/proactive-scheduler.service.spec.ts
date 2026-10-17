import { expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type {
  INotificationRepository,
  NotificationSchedulingTarget,
} from '../../database/interfaces';
import type { QueueService } from '../../infra/queue';
import { ProactiveSchedulerService } from './proactive-scheduler.service';

function setup(
  interval: number,
  notifiable = true,
  overrides: Partial<NotificationSchedulingTarget> = {},
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

  const repository = {
    listSchedulingTargets: () => Promise.resolve([target]),
  } as unknown as INotificationRepository;

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
      repository,
      queues,
      new ConfigService(),
    ),
    add,
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

test.each(['2026-10-15T14:00:00Z', '2026-10-15T23:55:00Z'])(
  'skips follow-ups during local quiet hours at %s',
  async (instant) => {
    const { service, add } = setup(30);
    await service.sweepFollowUps(new Date(instant));
    expect(add).not.toHaveBeenCalled();
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
    { kind: 'user', userId: 'owner', at: '2026-10-19T01:15:00.000Z' },
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

test('weekly briefing respects quiet hours even on the selected weekday', async () => {
  const { service, add } = setup(60, true, {
    briefingEnabled: false,
    briefingTime: '23:00',
  });

  await service.sweepBriefings(new Date('2026-10-19T15:00:00Z'));
  expect(add).not.toHaveBeenCalled();
});
