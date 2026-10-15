import { describe, expect, test } from '@jest/globals';
import type { Task } from '../../database/entities';
import type { IUserRepository } from '../../database/interfaces';
import { NotificationComposerService } from './notification-composer.service';

function dueTask(title = 'Pay invoice'): Task {
  return {
    id: 'task-1',
    title,
    description: null,
    dueAt: new Date('2026-10-08T02:00:00Z'),
    completedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    status: 'inbox',
    priority: 'high',
    categories: [],
    source: { type: 'dashboard', label: null, messageId: null },
  };
}

const owner = {
  persona: 'professional' as const,
  locale: 'en' as const,
  timezone: 'Asia/Makassar',
};

describe('follow-up composition', () => {
  test('uses a fixed introduction with compact rows for both channels', () => {
    const composer = new NotificationComposerService({} as IUserRepository);

    const bodies = composer.followUpTasksBodies(owner, [dueTask()]);

    expect(bodies).toEqual({
      telegram:
        'Tasks needing follow-up (1).\n\n- **Pay invoice** — Due 8 Oct 2026, 10:00 · Priority high',
      whatsapp:
        'Tasks needing follow-up (1).\n\n- Pay invoice — Due 8 Oct 2026, 10:00 · Priority high',
    });
  });

  test('localizes the fixed introduction and task metadata in Indonesian', () => {
    const composer = new NotificationComposerService({} as IUserRepository);

    const bodies = composer.followUpTasksBodies({ ...owner, locale: 'id' }, [
      dueTask(),
    ]);

    expect(bodies.whatsapp).toBe(
      'Tugas yang perlu ditindaklanjuti (1).\n\n- Pay invoice — Tenggat 8 Okt 2026, 10.00 · Prioritas tinggi',
    );
  });

  test('persona does not change follow-up wording', () => {
    const composer = new NotificationComposerService({} as IUserRepository);

    const playfulOwner = { ...owner, persona: 'playful' as const };

    const professional = composer.followUpTasksBodies(owner, [dueTask()]);
    const playful = composer.followUpTasksBodies(playfulOwner, [dueTask()]);

    expect(playful).toEqual(professional);
  });

  test('preserves template-like characters in task titles', () => {
    const composer = new NotificationComposerService({} as IUserRepository);

    const bodies = composer.followUpTasksBodies(owner, [
      dueTask('Review $& {items}'),
    ]);

    expect(bodies.whatsapp).toContain(
      '- Review $& {items} — Due 8 Oct 2026, 10:00 · Priority high',
    );
  });
});
