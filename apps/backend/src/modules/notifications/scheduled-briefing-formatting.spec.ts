import { expect, test } from '@jest/globals';
import type { BriefingSnapshot } from './briefing-prompt';
import { renderBriefingBody } from './notification-formatting';
import {
  BRIEFING_MESSAGE_LIMIT,
  renderScheduledBriefing,
} from './scheduled-briefing-formatting';

const format = { locale: 'en' as const, timezone: 'Asia/Makassar', rich: true };

function day(overrides: Partial<BriefingSnapshot> = {}): BriefingSnapshot {
  return {
    date: '2026-10-19',
    timezone: 'Asia/Makassar',
    instant: '2026-10-19T00:00:00Z',
    events: [],
    tasksDueToday: [],
    overdueTasks: [],
    remindersToday: [],
    ...overrides,
  };
}

function tomorrow(overrides: Partial<BriefingSnapshot> = {}): BriefingSnapshot {
  return day({
    date: '2026-10-20',
    instant: '2026-10-19T16:00:00Z',
    ...overrides,
  });
}

test.each([
  ['en', 'combined', 'Weekly briefing', '19 Oct 2026', '20 Oct 2026', 'Today'],
  [
    'en',
    'weekly',
    'Weekly briefing',
    '19 Oct 2026',
    '20 Oct 2026',
    '19 Oct 2026',
  ],
  [
    'id',
    'combined',
    'Briefing mingguan',
    '19 Okt 2026',
    '20 Okt 2026',
    'Hari ini',
  ],
  [
    'id',
    'weekly',
    'Briefing mingguan',
    '19 Okt 2026',
    '20 Okt 2026',
    '19 Okt 2026',
  ],
] as const)(
  'Telegram %s %s brief preserves blank lines around the introduction',
  (locale, layout, title, start, end, firstSection) => {
    const { content } = renderScheduledBriefing(
      { ...format, locale },
      day({
        tasksDueToday: [{ title: 'Invoice', priority: 'medium', dueAt: null }],
      }),
      [tomorrow()],
      'Briefing.',
      layout,
    );

    expect(
      content.startsWith(
        [
          `**${title} · ${start}–${end}**`,
          'Briefing.',
          `**${firstSection}**`,
        ].join('\\\n\\\n') + '\n\n',
      ),
    ).toBe(true);
  },
);

test.each([
  ['en', 'Coming six days'],
  ['id', 'Enam hari ke depan'],
] as const)(
  'combined Telegram brief separates today from the weekly section in %s',
  (locale, heading) => {
    const { content } = renderScheduledBriefing(
      { ...format, locale },
      day(),
      [tomorrow()],
      'Briefing.',
    );

    expect(content).toContain(`\n\n---\n\n**${heading}**`);
    expect(content.match(/^---$/gm)).toHaveLength(1);
  },
);

test('combined WhatsApp brief keeps its plain section spacing without a Markdown divider', () => {
  const { content } = renderScheduledBriefing(
    { ...format, rich: false },
    day(),
    [tomorrow()],
    'Briefing.',
  );

  expect(content).toContain('\n\nComing six days\n\n');
  expect(content).not.toContain('\n\n---\n\n');
});

test('standalone Telegram weekly brief does not add a daily-to-weekly divider', () => {
  const { content } = renderScheduledBriefing(
    format,
    day(),
    [tomorrow()],
    'Briefing.',
    'weekly',
  );

  expect(content).not.toContain('\n\n---\n\n');
});

test.each([
  ['en', 'No tasks, events, or reminders in the coming seven days.'],
  ['id', 'Belum ada tugas, agenda, atau pengingat untuk tujuh hari ke depan.'],
] as const)(
  'empty standalone weekly brief describes the full period in %s',
  (locale, expected) => {
    const { content } = renderScheduledBriefing(
      { ...format, locale },
      day(),
      [tomorrow()],
      'Briefing.',
      'weekly',
    );

    expect(content).toContain(expected);
    expect(content).not.toContain('Coming six days');
    expect(content).not.toContain('Enam hari ke depan');
  },
);

test('standalone weekly layout preserves full rows and omission counts within one message', () => {
  const today = day({
    tasksDueToday: [
      {
        title: 'x'.repeat(5000),
        priority: 'high',
        dueAt: '2026-10-19T02:00:00Z',
      },
      {
        title: 'Small invoice',
        priority: 'low',
        dueAt: '2026-10-19T03:00:00Z',
      },
    ],
  });

  const result = renderScheduledBriefing(
    format,
    today,
    [tomorrow()],
    'Briefing.',
    'weekly',
  );

  expect(result.content.length).toBeLessThanOrEqual(BRIEFING_MESSAGE_LIMIT);
  expect(result.content).toContain(
    '- **Small invoice** — Due 19 Oct 2026, 11:00 · Priority low',
  );
  expect(result.omitted).toBe(1);
  expect(result.content).toContain('1 more item omitted');
});

test('daily-only brief retains the existing rows and section formatting', () => {
  const today = day({
    overdueTasks: [
      { title: 'Invoice', priority: 'high', dueAt: '2026-10-18T01:00:00Z' },
    ],
    events: [
      {
        title: 'Standup',
        kind: 'timed',
        startAt: '2026-10-19T02:00:00Z',
        endAt: '2026-10-19T03:00:00Z',
      },
    ],
  });

  expect(
    renderScheduledBriefing(format, today, null, 'Your day ahead.'),
  ).toEqual({
    content: renderBriefingBody(format, today, 'Your day ahead.'),
    omitted: 0,
  });
});

test('weekly brief separates today from later dates with the same full task metadata', () => {
  const today = day({
    tasksDueToday: [
      {
        title: 'Today invoice',
        priority: 'high',
        dueAt: '2026-10-19T02:00:00Z',
      },
    ],
  });

  const later = tomorrow({
    tasksDueToday: [
      {
        title: 'Tomorrow invoice',
        priority: 'low',
        dueAt: '2026-10-20T02:00:00Z',
      },
    ],
  });

  const { content } = renderScheduledBriefing(
    format,
    today,
    [later],
    'Your day ahead.',
  );

  expect(content).toContain('**Today**');
  expect(content).toContain(
    '**Coming six days**\n\n**20 Oct 2026**\n\n**Tasks (1)**',
  );
  expect(content).toContain(
    '- **Tomorrow invoice** — Due 20 Oct 2026, 10:00 · Priority low',
  );
  expect(content.match(/Today invoice/g)).toHaveLength(1);
});

test('empty upcoming period is stated explicitly', () => {
  expect(
    renderScheduledBriefing(format, day(), [tomorrow()], 'Your day ahead.')
      .content,
  ).toContain('No tasks, events, or reminders in the coming six days.');
});

test('overdue items survive the budget before future high-priority items without shortening rows', () => {
  const title = `Overdue invoice ${'x'.repeat(2100)}`;
  const today = day({
    overdueTasks: [{ title, priority: 'low', dueAt: '2026-10-18T02:00:00Z' }],
  });

  const later = tomorrow({
    tasksDueToday: [
      {
        title: `Future task ${'y'.repeat(2100)}`,
        priority: 'high',
        dueAt: '2026-10-20T02:00:00Z',
      },
    ],
  });

  const result = renderScheduledBriefing(
    format,
    today,
    [later],
    'Your day ahead.',
  );

  expect(result.content.length).toBeLessThanOrEqual(BRIEFING_MESSAGE_LIMIT);
  expect(result.content).toContain(
    `- **${title}** — Due 18 Oct 2026, 10:00 · Priority low`,
  );
  expect(result.content).not.toContain('Future task');
  expect(result.omitted).toBe(1);
  expect(result.content).toContain(
    '1 more item omitted to keep this briefing in one message.',
  );
});

test('earliest appointment survives before a later high-priority task', () => {
  const today = day({
    tasksDueToday: [
      {
        title: `Later high priority ${'x'.repeat(2100)}`,
        priority: 'high',
        dueAt: '2026-10-19T04:00:00Z',
      },
    ],
    events: [
      {
        title: `Earlier appointment ${'y'.repeat(2100)}`,
        kind: 'timed',
        startAt: '2026-10-19T01:00:00Z',
        endAt: '2026-10-19T02:00:00Z',
      },
    ],
  });

  const { content } = renderScheduledBriefing(
    format,
    today,
    null,
    'Your day ahead.',
  );

  expect(content).toContain('Earlier appointment');
  expect(content).not.toContain('Later high priority');
});

test('task priority breaks ties at the same due instant', () => {
  const today = day({
    tasksDueToday: [
      {
        title: `Low priority ${'x'.repeat(2100)}`,
        priority: 'low',
        dueAt: '2026-10-19T04:00:00Z',
      },
      {
        title: `High priority ${'y'.repeat(2100)}`,
        priority: 'high',
        dueAt: '2026-10-19T04:00:00Z',
      },
    ],
  });

  const { content } = renderScheduledBriefing(
    format,
    today,
    null,
    'Your day ahead.',
  );

  expect(content).toContain('High priority');
  expect(content).not.toContain('Low priority');
});

test('an item larger than the whole budget is omitted intact while smaller items still fit', () => {
  const today = day({
    overdueTasks: [
      {
        title: 'x'.repeat(5000),
        priority: 'high',
        dueAt: '2026-10-18T02:00:00Z',
      },
      {
        title: 'Small overdue task',
        priority: 'medium',
        dueAt: '2026-10-18T03:00:00Z',
      },
    ],
  });

  const result = renderScheduledBriefing(
    { ...format, locale: 'id', rich: false },
    today,
    null,
    'Agenda hari ini.',
  );

  expect(result.omitted).toBe(1);
  expect(result.content).toContain(
    'Small overdue task — Tenggat 18 Okt 2026, 11.00',
  );
  expect(result.content).not.toContain('xxx');
  expect(result.content).toContain('1 item lainnya tidak ditampilkan');
});
