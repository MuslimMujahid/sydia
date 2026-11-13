import { describe, expect, test } from '@jest/globals';
import type { Task } from '../../database/entities';
import type {
  IUserRepository,
  ReminderDelivery,
} from '../../database/interfaces';
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

describe('reminder composition', () => {
  const reminder: ReminderDelivery = {
    id: 'reminder-1',
    userId: 'user-1',
    title: 'Minum obat',
    notes: null,
    scheduledAt: new Date('2026-11-13T01:00:00Z'),
    timezone: 'Asia/Jakarta',
    recurrence: null,
    important: false,
    repeatIntervalMinutes: 5,
    snoozedFrom: null,
    latestOccurrence: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    source: { type: 'dashboard', label: null, messageId: null },
  };

  const composer = (locale: 'id' | 'en') =>
    new NotificationComposerService({
      findById: () => Promise.resolve({ locale, timezone: 'Asia/Jakarta' }),
    } as unknown as IUserRepository);

  test('a regular reminder keeps the single-clock template without a reply hint', async () => {
    const body = await composer('id').reminderBody(reminder);

    expect(body.startsWith('⏰ Pengingat - Minum obat')).toBe(true);
    expect(body).not.toContain('Balas');
  });

  test('an important reminder uses three clocks and says how to stop or snooze it', async () => {
    const body = await composer('id').reminderBody({
      ...reminder,
      important: true,
    });

    expect(body.startsWith('⏰⏰⏰ Pengingat penting - Minum obat\n')).toBe(
      true,
    );
    expect(
      body.endsWith("Balas 'oke' kalau sudah, atau 'ingatkan 15 menit lagi'."),
    ).toBe(true);
  });

  test('a repeat names its number and keeps the occurrence time', async () => {
    const first = await composer('en').reminderBody({
      ...reminder,
      important: true,
    });

    const repeat = await composer('en').reminderBody(
      {
        ...reminder,
        important: true,
        scheduledAt: new Date('2026-11-14T01:00:00Z'),
      },
      { occurrenceAt: reminder.scheduledAt, sequence: 3 },
    );

    expect(repeat.split('\n')[0]).toBe(
      '⏰⏰⏰ Important reminder - Minum obat (reminder #3)',
    );
    expect(repeat.split('\n').slice(1)).toEqual(first.split('\n').slice(1));
  });

  test('the final note tells the user how to ask again', async () => {
    await expect(composer('id').reminderFinalBody(reminder)).resolves.toBe(
      "Aku berhenti mengingatkan 'Minum obat'. Balas 'ingatkan X lagi' kalau masih perlu.",
    );
  });
});
