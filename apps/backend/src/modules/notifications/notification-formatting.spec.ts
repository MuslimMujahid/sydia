import { describe, expect, test } from '@jest/globals';
import type { BriefingSnapshot } from './briefing-prompt';
import {
  notificationTaskRow,
  renderBriefingBody,
} from './notification-formatting';

const format = { locale: 'en' as const, timezone: 'Asia/Makassar', rich: true };

function snapshot(overrides: Partial<BriefingSnapshot> = {}): BriefingSnapshot {
  return {
    date: '2026-10-09',
    timezone: 'Asia/Makassar',
    instant: '2026-10-09T02:00:00Z',
    events: [],
    tasksDueToday: [],
    overdueTasks: [],
    remindersToday: [],
    ...overrides,
  };
}

describe('proactive notification formatting', () => {
  test('Telegram escapes literal titles before bolding them', () => {
    expect(
      notificationTaskRow(format, {
        title: 'Read [draft] *today*',
        dueAt: null,
        priority: 'medium',
      }),
    ).toBe(String.raw`- **Read \[draft\] \*today\***`);
  });

  test('WhatsApp preserves literal punctuation without adding markup', () => {
    expect(
      notificationTaskRow(
        { ...format, rich: false },
        { title: 'Read [draft] *today*', dueAt: null, priority: 'medium' },
      ),
    ).toBe('- Read [draft] *today*');
  });

  test('omits default priority and missing due time', () => {
    expect(
      notificationTaskRow(format, {
        title: 'Read draft',
        dueAt: null,
        priority: 'medium',
      }),
    ).toBe('- **Read draft**');
  });

  test('localizes task metadata and uses the owner timezone', () => {
    expect(
      notificationTaskRow(
        { ...format, locale: 'id' },
        {
          title: 'Bayar tagihan',
          dueAt: '2026-10-08T02:00:00Z',
          priority: 'high',
        },
      ),
    ).toBe(
      '- **Bayar tagihan** — Tenggat 8 Okt 2026, 10.00 · Prioritas tinggi',
    );
  });

  test('empty brief contains only its introduction', () => {
    expect(
      renderBriefingBody(format, snapshot(), 'Nothing scheduled today.'),
    ).toBe('Nothing scheduled today.');
  });

  test('brief places overdue work first and omits empty sections', () => {
    expect(
      renderBriefingBody(
        format,
        snapshot({
          overdueTasks: [
            { title: 'Pay invoice', dueAt: null, priority: 'high' },
          ],
          tasksDueToday: [
            { title: 'Read draft', dueAt: null, priority: 'medium' },
          ],
        }),
        'Your day ahead.',
      ),
    ).toBe(
      'Your day ahead.\n\n**Overdue tasks (1)**\n\n- **Pay invoice** — Priority high\n\n**Tasks due today (1)**\n\n- **Read draft**',
    );
  });

  test('brief renders agenda and reminder times inline', () => {
    expect(
      renderBriefingBody(
        format,
        snapshot({
          events: [
            {
              title: 'Planning',
              startAt: '2026-10-09T03:00:00Z',
              endAt: '2026-10-09T04:00:00Z',
            },
          ],
          remindersToday: [
            { title: 'Call supplier', scheduledAt: '2026-10-09T05:00:00Z' },
          ],
        }),
        'Your day ahead.',
      ),
    ).toBe(
      'Your day ahead.\n\n**Agenda (1)**\n\n- **Planning** — 9 Oct 2026, 11:00–12:00\n\n**Reminders today (1)**\n\n- **Call supplier** — At 9 Oct 2026, 13:00',
    );
  });
  test('overnight agenda includes the ending date', () => {
    expect(
      renderBriefingBody(
        format,
        snapshot({
          events: [
            {
              title: 'Night shift',
              startAt: '2026-10-09T15:00:00Z',
              endAt: '2026-10-09T18:00:00Z',
            },
          ],
        }),
        'Your day ahead.',
      ),
    ).toContain('- **Night shift** — 9 Oct 2026, 23:00–10 Oct 2026, 02:00');
  });
});
