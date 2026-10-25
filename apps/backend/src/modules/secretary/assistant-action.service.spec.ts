/* eslint-disable @typescript-eslint/require-await -- in-memory doubles implement async repository contracts */
import { jest } from '@jest/globals';
import type {
  AssistancePreference,
  AssistantAction,
  AssistantActionStatus,
  NewAssistantAction,
} from '../../database/entities';
import type {
  AssistantActionUpdate,
  IAssistantActionRepository,
  IConversationRepository,
  IReminderRepository,
  ITaskRepository,
  IUserRepository,
} from '../../database/interfaces';
import type { CalendarService } from '../calendar/calendar.service';
import type { NotesService } from '../notes/notes.service';
import type { ReminderSchedulerService } from '../reminders/reminder-scheduler.service';
import { AssistancePolicyService } from './assistance-policy.service';
import { AssistantActionService } from './assistant-action.service';
import type { AvailabilityService } from './availability.service';

class MemoryActions implements IAssistantActionRepository {
  rows: AssistantAction[] = [];
  preference: AssistancePreference | null = null;
  private seq = 0;

  async prepare(input: NewAssistantAction) {
    const existing = this.rows.find(
      (row) =>
        row.userId === input.userId &&
        row.deduplicationKey === input.deduplicationKey,
    );

    if (existing) return { action: { ...existing }, created: false };
    const now = new Date();
    const row: AssistantAction = {
      ...input,
      id: `a${++this.seq}`,
      version: 1,
      status: 'prepared',
      offerMessageId: null,
      statusReason: null,
      snoozedUntil: null,
      acceptedMessageId: null,
      acceptedAt: null,
      decidedAt: null,
      executionLeaseUntil: null,
      resultType: null,
      resultId: null,
      receiptKey: null,
      lastErrorCode: null,
      createdAt: now,
      updatedAt: now,
    };

    this.rows.push(row);

    return { action: { ...row }, created: true };
  }

  async findById(userId: string, id: string) {
    const row = this.rows.find(
      (item) => item.userId === userId && item.id === id,
    );

    return row ? { ...row } : null;
  }

  async listForConversation(
    userId: string,
    conversationId: string,
    statuses: readonly AssistantActionStatus[],
  ) {
    return this.rows
      .filter(
        (row) =>
          row.userId === userId &&
          row.conversationId === conversationId &&
          statuses.includes(row.status),
      )
      .reverse()
      .map((row) => ({ ...row }));
  }

  async listForTarget(userId: string, behavior: string, targetRef: string) {
    return this.rows.filter(
      (row) =>
        row.userId === userId &&
        row.behavior === behavior &&
        row.targetRef === targetRef,
    );
  }

  async listPreparedBy(userId: string, preparedBy: string) {
    return this.rows.filter(
      (row) => row.userId === userId && row.preparedBy === preparedBy,
    );
  }

  async markOffered(
    userId: string,
    preparedBy: string,
    offerMessageId: string,
    ids?: readonly string[],
  ) {
    let count = 0;

    for (const row of this.rows)
      if (
        row.userId === userId &&
        row.preparedBy === preparedBy &&
        row.status === 'prepared' &&
        (!ids || ids.includes(row.id))
      ) {
        row.status = 'offered';
        row.offerMessageId = offerMessageId;
        count += 1;
      }

    return count;
  }

  async transition(
    userId: string,
    id: string,
    from: readonly AssistantActionStatus[],
    update: AssistantActionUpdate,
  ) {
    const row = this.rows.find(
      (item) => item.userId === userId && item.id === id,
    );

    if (!row || !from.includes(row.status)) return null;
    Object.assign(row, update);

    return { ...row };
  }

  async claimExecution(
    userId: string,
    id: string,
    now: Date,
    leaseUntil: Date,
  ) {
    const row = this.rows.find(
      (item) => item.userId === userId && item.id === id,
    );

    if (
      !row ||
      !row.acceptedAt ||
      !(
        ['authorized', 'failed'].includes(row.status) ||
        (row.status === 'executing' && row.executionLeaseUntil! < now)
      )
    )
      return null;
    row.status = 'executing';
    row.executionLeaseUntil = leaseUntil;

    return { ...row };
  }

  async listRecentForOwner(
    userId: string,
    _since: Date,
    statuses: readonly AssistantActionStatus[],
  ) {
    return this.rows.filter(
      (row) => row.userId === userId && statuses.includes(row.status),
    );
  }

  async listDueSnoozed() {
    return [];
  }

  async getPreference() {
    return this.preference;
  }

  async savePreference(userId: string, input: Partial<AssistancePreference>) {
    this.preference = {
      userId,
      pausedAll: false,
      pausedUntil: null,
      pausedBehaviors: [],
      quietStart: null,
      quietEnd: null,
      instructionMessageId: null,
      updatedAt: new Date(),
      ...this.preference,
      ...input,
    };

    return this.preference;
  }
}

const now = new Date('2026-10-25T10:00:00+08:00');

function setup(
  options: { slotAvailable?: boolean; createFails?: number } = {},
) {
  const actions = new MemoryActions();
  const messages: Array<{
    id: string;
    role: string;
    content: string;
    createdAt: Date;
  }> = [];

  const conversations = {
    findUserMessageContent: jest.fn(
      async (_u: string, id: string) =>
        messages.find((message) => message.id === id && message.role === 'user')
          ?.content ?? null,
    ),
    findMessagesSince: jest.fn(async () => messages),
  } as unknown as IConversationRepository;

  const users = {
    findById: jest.fn(async () => ({ id: 'u', timezone: 'Asia/Makassar' })),
  } as unknown as IUserRepository;

  const created: Array<{ title: string }> = [];
  let failures = options.createFails ?? 0;
  const tasks = {
    list: jest.fn(async () => []),
    findById: jest.fn(async (_u: string, id: string) =>
      created.find((_, i) => `t${i}` === id) ? { id } : null,
    ),
    create: jest.fn(async (_u: string, input: { title: string }) => {
      if (failures > 0) {
        failures -= 1;
        throw new Error('db write failed');
      }

      created.push(input);

      return { id: `t${created.length - 1}`, title: input.title };
    }),
  } as unknown as ITaskRepository;

  const events: Array<{ key: string }> = [];
  const calendar = {
    create: jest.fn(
      async (_u: string, input: { title: string }, _d: string, key: string) => {
        if (!events.some((event) => event.key === key)) events.push({ key });

        return { id: `e-${key}`, title: input.title };
      },
    ),
    findById: jest.fn(async () => ({ status: 'confirmed' })),
  } as unknown as CalendarService;

  const availability = {
    check: jest.fn(async () => ({
      requested: { available: options.slotAvailable ?? true, conflicts: [] },
      slots: [],
    })),
  } as unknown as AvailabilityService;

  const clock = { now: () => now };
  const policy = new AssistancePolicyService(actions, users, clock);
  const service = new AssistantActionService(
    actions,
    conversations,
    users,
    tasks,
    {} as IReminderRepository,
    {} as ReminderSchedulerService,
    calendar,
    {} as NotesService,
    availability,
    policy,
    clock,
  );

  const say = (id: string, role: 'user' | 'assistant', content = '') =>
    messages.push({ id, role, content, createdAt: new Date() });

  return { actions, service, say, created, events, availability, policy };
}

const taskOffer = {
  userId: 'u',
  conversationId: 'c1',
  preparedBy: 'run1',
  behavior: 'commitment' as const,
  actionType: 'create_task' as const,
  targetRef: 'commitment:kirim-ringkasan-acme',
  initiative: 'unsolicited' as const,
  parameters: {
    title: 'Kirim ringkasan review Acme',
    dueAt: '2026-10-26 16:00',
  },
  reason: 'User promised it.',
  evidence: [{ kind: 'message', id: 'm1', version: '1' }],
};

describe('AssistantActionService lifecycle', () => {
  test('a prepared action is not acceptable until its offer message persists', async () => {
    const { service, say, created } = setup();
    const prepared = await service.prepare(taskOffer);
    expect(prepared.status).toBe('prepared');
    const actionId = (prepared as { actionId: string }).actionId;

    say('m2', 'user', 'Ya.');
    const unshown = await service.respond({
      userId: 'u',
      conversationId: 'c1',
      sourceMessageId: 'm2',
      actionId,
      version: 1,
      decision: 'accept',
      referenceBasis: 'only_open_offer',
    });

    expect(unshown.status).toBe('not_shown');
    expect(created).toHaveLength(0);
  });

  test('accepting a shown offer executes exactly once, including on replay', async () => {
    const { service, say, created } = setup();
    const { actionId } = (await service.prepare(taskOffer)) as {
      actionId: string;
    };

    say('offer', 'assistant', 'Mau saya buatkan tugas?');
    await service.markOffered('u', 'run1', 'offer');
    say('yes', 'user', 'Ya, buat tugasnya.');

    const request = {
      userId: 'u',
      conversationId: 'c1',
      sourceMessageId: 'yes',
      actionId,
      version: 1,
      decision: 'accept' as const,
      referenceBasis: 'only_open_offer' as const,
    };

    expect((await service.respond(request)).status).toBe('completed');
    say('yes2', 'user', 'Ya, buat tugas itu.');
    const replay = await service.respond({
      ...request,
      sourceMessageId: 'yes2',
    });

    expect(replay.status).toBe('already_completed');
    expect(created).toEqual([
      expect.objectContaining({ title: 'Kirim ringkasan review Acme' }),
    ]);
  });

  test('a plain yes with two open offers asks which one and executes nothing', async () => {
    const { service, say, created, events } = setup();
    const task = (await service.prepare(taskOffer)) as { actionId: string };
    await service.prepare({
      ...taskOffer,
      actionType: 'create_calendar_event',
      behavior: 'scheduling',
      targetRef: 'task:pricing',
      initiative: 'requested',
      preparedBy: 'run2',
      parameters: {
        title: 'Fokus harga',
        date: '2026-10-26',
        start: '09:45',
        end: '10:45',
        bufferMinutes: 15,
        windowStart: '09:00',
        windowEnd: '17:00',
      },
    });
    say('offer1', 'assistant');
    await service.markOffered('u', 'run1', 'offer1');
    say('offer2', 'assistant');
    await service.markOffered('u', 'run2', 'offer2');
    say('yes', 'user', 'Ya, lakukan itu.');

    const result = await service.respond({
      userId: 'u',
      conversationId: 'c1',
      sourceMessageId: 'yes',
      actionId: task.actionId,
      version: 1,
      decision: 'accept',
      referenceBasis: 'only_open_offer',
    });

    expect(result.status).toBe('ambiguous');
    expect(created).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  test('a slot taken after the offer is revalidated and not saved', async () => {
    const { service, say, events, availability } = setup();
    const offer = (await service.prepare({
      ...taskOffer,
      behavior: 'scheduling',
      actionType: 'create_calendar_event',
      targetRef: 'task:pricing',
      parameters: {
        title: 'Fokus harga',
        date: '2026-10-26',
        start: '09:45',
        end: '10:45',
        bufferMinutes: 15,
        windowStart: '09:00',
        windowEnd: '17:00',
      },
    })) as { actionId: string };

    say('offer', 'assistant');
    await service.markOffered('u', 'run1', 'offer');
    (
      availability.check as jest.Mock<AvailabilityService['check']>
    ).mockResolvedValueOnce({
      requested: {
        interval: '',
        available: false,
        conflicts: [
          { title: 'Panggilan mendadak', interval: '', reason: 'overlap' },
        ],
      },
      slots: [],
    } as never);
    say('yes', 'user', 'Ya, pakai waktu itu.');

    const result = await service.respond({
      userId: 'u',
      conversationId: 'c1',
      sourceMessageId: 'yes',
      actionId: offer.actionId,
      version: 1,
      decision: 'accept',
      referenceBasis: 'only_open_offer',
    });

    expect(result.status).toBe('revalidation_failed');
    expect(events).toHaveLength(0);
  });

  test('a failed save reports failure and a conversational retry reuses the same action', async () => {
    const { service, say, created, actions } = setup({ createFails: 1 });
    const { actionId } = (await service.prepare(taskOffer)) as {
      actionId: string;
    };

    say('offer', 'assistant');
    await service.markOffered('u', 'run1', 'offer');
    say('yes', 'user', 'Ya.');
    const base = {
      userId: 'u',
      conversationId: 'c1',
      actionId,
      version: 1,
      referenceBasis: 'only_open_offer' as const,
    };

    expect(
      (
        await service.respond({
          ...base,
          sourceMessageId: 'yes',
          decision: 'accept',
        })
      ).status,
    ).toBe('failed');
    expect(created).toHaveLength(0);
    say('retry', 'user', 'Coba lagi.');
    expect(
      (
        await service.respond({
          ...base,
          sourceMessageId: 'retry',
          decision: 'retry',
        })
      ).status,
    ).toBe('completed');
    expect(created).toHaveLength(1);
    expect(actions.rows).toHaveLength(1);
  });

  test('a retry phrase cannot supply initial consent', async () => {
    const { service, say, created } = setup();
    const { actionId } = (await service.prepare(taskOffer)) as {
      actionId: string;
    };

    say('offer', 'assistant');
    await service.markOffered('u', 'run1', 'offer');
    say('retry', 'user', 'Coba lagi.');

    const result = await service.respond({
      userId: 'u',
      conversationId: 'c1',
      sourceMessageId: 'retry',
      actionId,
      version: 1,
      decision: 'retry',
      referenceBasis: 'only_open_offer',
    });

    expect(result.status).toBe('not_accepted');
    expect(created).toHaveLength(0);
  });

  test('dismissal suppresses the same unsolicited offer until evidence changes', async () => {
    const { service, say } = setup();
    const { actionId } = (await service.prepare(taskOffer)) as {
      actionId: string;
    };

    say('offer', 'assistant');
    await service.markOffered('u', 'run1', 'offer');
    say('no', 'user', 'Tidak perlu.');
    await service.respond({
      userId: 'u',
      conversationId: 'c1',
      sourceMessageId: 'no',
      actionId,
      version: 1,
      decision: 'dismiss',
      referenceBasis: 'only_open_offer',
    });

    const again = await service.prepare({
      ...taskOffer,
      conversationId: 'c2',
      preparedBy: 'run9',
      parameters: { ...taskOffer.parameters, title: 'Kirim ringkasan Acme' },
    });

    expect(again).toMatchObject({
      status: 'suppressed',
      reason: 'dismissed_by_user',
    });

    const changed = await service.prepare({
      ...taskOffer,
      conversationId: 'c2',
      preparedBy: 'run10',
      evidence: [{ kind: 'message', id: 'm1', version: '2' }],
    });

    expect(changed.status).toBe('prepared');
  });

  test('a conversational pause suppresses unsolicited offers but not requested ones', async () => {
    const { service, policy } = setup();
    await policy.remember('u', 'm0', { pauseAll: true });

    expect(await service.prepare(taskOffer)).toMatchObject({
      status: 'suppressed',
      reason: 'user_paused_suggestions',
    });
    expect(
      (
        await service.prepare({
          ...taskOffer,
          initiative: 'requested',
          preparedBy: 'run2',
        })
      ).status,
    ).toBe('prepared');
  });

  test('an already shown offer is not re-offered from another conversation', async () => {
    const { service } = setup();
    await service.prepare(taskOffer);
    await service.markOffered('u', 'run1', 'offer');

    const again = await service.prepare({
      ...taskOffer,
      conversationId: 'telegram-chat',
      preparedBy: 'run5',
    });

    expect(again.status).toBe('already_offered');
  });

  test('an unshown prepared action never suppresses a later real offer', async () => {
    const { service } = setup();
    await service.prepare(taskOffer);
    // The turn failed before its message persisted; a fresh turn may offer it.
    const later = await service.prepare({
      ...taskOffer,
      conversationId: 'c3',
      preparedBy: 'run7',
    });

    expect(later.status).toBe('prepared');
  });

  test('one unsolicited suggestion per turn', async () => {
    const { service } = setup();
    await service.prepare(taskOffer);
    const second = await service.prepare({
      ...taskOffer,
      targetRef: 'commitment:other',
      parameters: { title: 'Other' },
    });

    expect(second).toMatchObject({
      status: 'suppressed',
      reason: 'turn_suggestion_limit',
    });
  });
});
