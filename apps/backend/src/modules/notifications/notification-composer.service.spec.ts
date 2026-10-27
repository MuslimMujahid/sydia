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

describe('Google Meet follow-up composition', () => {
  function composerFor(locale: 'en' | 'id') {
    return new NotificationComposerService({
      findById: () => Promise.resolve({ locale, timezone: 'Asia/Makassar' }),
    } as unknown as IUserRepository);
  }

  test('announces a ready link in English', async () => {
    await expect(
      composerFor('en').googleMeetOutcomeBody('user-1', {
        title: 'Sprint review',
        status: 'success',
        googleMeetUrl: 'https://meet.google.com/abc-defg-hij',
      }),
    ).resolves.toBe(
      'Your Google Meet link for "Sprint review" is ready: https://meet.google.com/abc-defg-hij',
    );
  });

  test('announces a ready link in Indonesian', async () => {
    await expect(
      composerFor('id').googleMeetOutcomeBody('user-1', {
        title: 'Rapat tim',
        status: 'success',
        googleMeetUrl: 'https://meet.google.com/abc-defg-hij',
      }),
    ).resolves.toBe(
      'Link Google Meet untuk "Rapat tim" sudah siap: https://meet.google.com/abc-defg-hij',
    );
  });

  test('asks the user to retry when the conference failed', async () => {
    await expect(
      composerFor('en').googleMeetOutcomeBody('user-1', {
        title: 'Sprint review',
        status: 'failure',
        googleMeetUrl: null,
      }),
    ).resolves.toBe(
      `Couldn't create the Google Meet link for "Sprint review". Ask me to try again.`,
    );

    await expect(
      composerFor('id').googleMeetOutcomeBody('user-1', {
        title: 'Rapat tim',
        status: 'failure',
        googleMeetUrl: null,
      }),
    ).resolves.toBe(
      'Link Google Meet untuk "Rapat tim" gagal dibuat. Minta saya coba lagi, ya.',
    );
  });

  test('a success without a link uses the failure copy instead of an empty URL', async () => {
    await expect(
      composerFor('id').googleMeetOutcomeBody('user-1', {
        title: 'Rapat tim',
        status: 'success',
        googleMeetUrl: null,
      }),
    ).resolves.toBe(
      'Link Google Meet untuk "Rapat tim" gagal dibuat. Minta saya coba lagi, ya.',
    );
  });

  test('a template-like title cannot displace the link', async () => {
    await expect(
      composerFor('en').googleMeetOutcomeBody('user-1', {
        title: '{url} review',
        status: 'success',
        googleMeetUrl: 'https://meet.google.com/abc-defg-hij',
      }),
    ).resolves.toBe(
      'Your Google Meet link for "{url} review" is ready: https://meet.google.com/abc-defg-hij',
    );
  });

  test('a missing owner fails loudly', async () => {
    const composer = new NotificationComposerService({
      findById: () => Promise.resolve(null),
    } as unknown as IUserRepository);

    await expect(
      composer.googleMeetOutcomeBody('user-1', {
        title: 'Sprint review',
        status: 'success',
        googleMeetUrl: 'https://meet.google.com/abc-defg-hij',
      }),
    ).rejects.toThrow('Google Meet update owner is missing.');
  });
});

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
