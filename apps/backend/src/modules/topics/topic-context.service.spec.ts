import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { Topic, TopicItemSummary } from '../../database/entities';
import type {
  ITopicRepository,
  IUserRepository,
  NewTopicRecognitionLog,
} from '../../database/interfaces';
import { DecisionSettings } from '../../infra/decision-gateway';
import {
  TopicContextService,
  episodeStart,
  orderBlockItems,
  renderTopicBlock,
  topicUrgency,
} from './topic-context.service';
import type {
  TopicRecognitionInput,
  TopicRecognitionService,
} from './topic-recognition.service';

const HOUR = 3_600_000;
const now = new Date('2026-11-21T02:00:00.000Z');
const ago = (hours: number) => new Date(now.getTime() - hours * HOUR);

const item = (extra: Partial<TopicItemSummary>): TopicItemSummary => ({
  topicId: 't-1',
  type: 'reminder',
  id: 'r-1',
  title: 'Bayar iuran',
  when: null,
  day: null,
  status: 'pending',
  active: true,
  recurring: false,
  origin: 'touched',
  linkedAt: ago(10),
  ...extra,
});

const topic: Topic = {
  id: 't-1',
  userId: 'user-1',
  label: 'Study tour',
  aliases: ['karyawisata'],
  embedding: [1, 0],
  status: 'active',
  salience: 2,
  salienceAtActiveDay: 1,
  gateCutoffOffset: 0,
  gateOffsetAtActiveDay: 0,
  episodeCount: 2,
  lastEpisodeKey: null,
  lastActiveAt: ago(30),
  createdAt: ago(60),
};

describe('topic turn helpers', () => {
  it('starts the episode after the last idle gap and ignores later messages', () => {
    const message = (id: string, hours: number, role = 'user') => ({
      id,
      role,
      content: id,
      createdAt: ago(hours),
    });

    const current = message('now', 0);

    expect(
      episodeStart(
        [
          message('old', 10),
          message('a', 3),
          message('reply', 2.9, 'assistant'),
          message('b', 1),
          current,
        ],
        current,
        4 * HOUR,
      ),
    ).toEqual(ago(3));
  });

  it('makes the nearest pending item the most urgent and ignores past or inactive ones', () => {
    const urgency = topicUrgency(
      [
        item({ when: new Date(now.getTime() + 24 * HOUR) }),
        item({ topicId: 't-2', when: new Date(now.getTime() + 9 * 24 * HOUR) }),
        item({ topicId: 't-3', when: ago(5) }),
        item({
          topicId: 't-4',
          when: new Date(now.getTime() + HOUR),
          active: false,
        }),
        item({
          topicId: 't-5',
          when: new Date(now.getTime() + 60 * 24 * HOUR),
        }),
      ],
      now,
    );

    expect(urgency.get('t-1')).toBeCloseTo(0.5);
    expect(urgency.get('t-2')).toBeCloseTo(0.1);
    expect([...urgency.keys()].sort()).toEqual(['t-1', 't-2']);
  });

  it('orders block items active first, then nearest, then stated before inferred', () => {
    const ordered = orderBlockItems(
      [
        item({
          id: 'done',
          active: false,
          when: new Date(now.getTime() + HOUR),
        }),
        item({ id: 'far', when: new Date(now.getTime() + 48 * HOUR) }),
        item({ id: 'near', when: new Date(now.getTime() + 2 * HOUR) }),
        item({ id: 'inferred', origin: 'inferred' }),
        item({ id: 'touched' }),
      ],
      now,
    );

    expect(ordered.map(({ id }) => id)).toEqual([
      'near',
      'far',
      'touched',
      'inferred',
      'done',
    ]);
  });

  it('renders owner-local times and the topic id the disconnect tool needs', () => {
    const block = renderTopicBlock(
      topic,
      [
        {
          id: 'c',
          topicId: 't-1',
          kind: 'next_step',
          text: 'Bayar iuran Jumat',
          explicit: true,
          messageId: null,
          createdAt: now,
        },
      ],
      [item({ when: new Date('2026-11-26T11:00:00.000Z') })],
      'Asia/Makassar',
      now,
    );

    const data = JSON.parse(block.split('\n')[0]!) as Record<string, unknown>;

    expect(data).toMatchObject({
      topicId: 't-1',
      topic: 'Study tour',
      state: { nextSteps: ['Bayar iuran Jumat'] },
      items: [{ id: 'r-1', when: '2026-11-26 19:00', status: 'pending' }],
    });
    expect(block).toContain('disconnect_topic');
  });
});

function setup(options: {
  mode?: string;
  memory?: boolean;
  suppressed?: string[];
  choose?: string | null;
  slow?: boolean;
}) {
  const logs: NewTopicRecognitionLog[] = [];
  const recognize = jest.fn((input: TopicRecognitionInput) =>
    options.slow
      ? new Promise<never>(() => undefined)
      : Promise.resolve({
          candidates: input.topics.map((t) => ({
            topicId: t.id,
            status: t.status,
            similarity: 0.6,
            salience: 1,
            score: 0.6,
            offered: true,
          })),
          choice: options.choose ?? null,
          confidence: 0.9,
          topicId: options.choose ?? null,
        }),
  );

  const repository = {
    list: () =>
      Promise.resolve([topic, { ...topic, id: 't-2', label: 'Pesta' }]),
    suppressedTopicIds: () => Promise.resolve(options.suppressed ?? []),
    activeDayCount: () => Promise.resolve(3),
    conversationState: () => Promise.resolve(null),
    claims: () => Promise.resolve([]),
    linkedItems: () => Promise.resolve([]),
    logRecognition: (input: NewTopicRecognitionLog) => {
      logs.push(input);

      return Promise.resolve();
    },
  } as unknown as ITopicRepository;

  const service = new TopicContextService(
    repository,
    {
      findById: () =>
        Promise.resolve({
          id: 'user-1',
          automaticMemoryEnabled: options.memory ?? true,
        }),
    } as unknown as IUserRepository,
    new DecisionSettings(
      new ConfigService({
        BACKEND_TOPIC_RECOGNITION_MODE: options.mode ?? 'enabled',
        BACKEND_DECISION_COHORT: '*',
        BACKEND_DECISION_CALIBRATION_VERSION: 'test',
      }),
    ),
    { recognize } as unknown as TopicRecognitionService,
  );

  const turn = () =>
    service.forTurn({
      userId: 'user-1',
      conversationId: 'c-1',
      messageId: 'm-1',
      messages: [
        {
          id: 'm-1',
          role: 'user',
          content: 'Iuran study tour?',
          createdAt: now,
        },
      ],
      timezone: 'Asia/Makassar',
      now,
    });

  return { turn, recognize, logs };
}

describe('topic context for a turn', () => {
  it('stays out of turns while the feature is only in shadow mode', async () => {
    const { turn, recognize } = setup({ mode: 'shadow', choose: 't-1' });

    expect(await turn()).toBeNull();
    expect(recognize).not.toHaveBeenCalled();
  });

  it('stays out when the user turned automatic memory off', async () => {
    const { turn, recognize } = setup({ memory: false, choose: 't-1' });

    expect(await turn()).toBeNull();
    expect(recognize).not.toHaveBeenCalled();
  });

  it('returns the accepted topic block and logs the turn recognition', async () => {
    const { turn, logs } = setup({ choose: 't-1' });

    const result = await turn();

    expect(result?.topicId).toBe('t-1');
    expect(result?.block).toContain('"topic":"Study tour"');
    expect(logs).toEqual([
      expect.objectContaining({
        messageId: 'm-1',
        mode: 'enabled',
        accepted: true,
      }),
    ]);
  });

  it('never offers a topic the user disconnected in this episode', async () => {
    const { turn, recognize } = setup({ suppressed: ['t-1'], choose: 't-2' });

    await turn();

    expect(recognize.mock.calls[0]![0].topics.map(({ id }) => id)).toEqual([
      't-2',
    ]);
  });

  it('gives no context when recognition chooses none', async () => {
    const { turn } = setup({ choose: null });

    expect(await turn()).toBeNull();
  });

  it('gives up at its deadline instead of holding the turn', async () => {
    jest.useFakeTimers();

    try {
      const { turn } = setup({ slow: true });
      const pending = turn();
      await jest.advanceTimersByTimeAsync(2200);

      expect(await pending).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
