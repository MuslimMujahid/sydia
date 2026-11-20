import type { Topic } from '../../database/entities';
import type { ITopicRepository, TopicUpdate } from '../../database/interfaces';
import { lifecycleChange, overCap } from './topic-lifecycle';
import { TopicLifecycleService } from './topic-lifecycle.service';
import { namesTopic } from './topic-naming';

const DAY = 24 * 60 * 60_000;
const now = new Date('2026-12-01T00:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);

const base = {
  salience: 1,
  salienceAtActiveDay: 100,
  statusAtActiveDay: 100,
  lastActiveAt: daysAgo(1),
  createdAt: daysAgo(1),
};

const at = (activeDay: number, anchored = false) => ({
  activeDay,
  now,
  anchored,
});

describe('topic lifecycle rules', () => {
  it('expires an unconfirmed candidate after 30 days', () => {
    expect(
      lifecycleChange(
        { ...base, status: 'candidate', createdAt: daysAgo(31) },
        at(100),
      ),
    ).toEqual({ kind: 'delete', reason: 'candidate_expired' });
    expect(
      lifecycleChange(
        { ...base, status: 'candidate', createdAt: daysAgo(29) },
        at(100),
      ),
    ).toBeNull();
  });

  it('lets a topic nobody returns to go dormant once its salience has decayed', () => {
    // Salience 1 halves every 14 active days: 0.25 after 28.
    expect(lifecycleChange({ ...base, status: 'active' }, at(128))).toEqual({
      kind: 'status',
      status: 'dormant',
    });
    expect(lifecycleChange({ ...base, status: 'active' }, at(110))).toBeNull();
  });

  it('never moves down a topic with a pending item', () => {
    expect(
      lifecycleChange({ ...base, status: 'active' }, at(200, true)),
    ).toBeNull();
    expect(
      lifecycleChange({ ...base, status: 'dormant' }, at(300, true)),
    ).toBeNull();
  });

  it('keeps a newly active topic through its grace period', () => {
    expect(
      lifecycleChange(
        { ...base, status: 'active', salience: 0.1, statusAtActiveDay: 125 },
        at(128),
      ),
    ).toBeNull();
  });

  it('dismisses a dormant topic after 60 active days and deletes a dismissed one after a year', () => {
    expect(lifecycleChange({ ...base, status: 'dormant' }, at(160))).toEqual({
      kind: 'status',
      status: 'dismissed',
      dismissedReason: 'inactive',
    });
    expect(lifecycleChange({ ...base, status: 'dormant' }, at(159))).toBeNull();
    expect(
      lifecycleChange(
        { ...base, status: 'dismissed', lastActiveAt: daysAgo(366) },
        at(100),
      ),
    ).toEqual({ kind: 'delete', reason: 'dismissed_expired' });
  });

  it('counts only days the user was active, so time away changes nothing', () => {
    // A year away, but no active day passed since the status change.
    expect(
      lifecycleChange(
        { ...base, status: 'active', salience: 1, lastActiveAt: daysAgo(300) },
        at(100),
      ),
    ).toBeNull();
  });

  it('demotes the weakest unanchored topics over the cap', () => {
    const topics = [
      { id: 'strong', salience: 5, salienceAtActiveDay: 0, anchored: false },
      { id: 'weak', salience: 0.5, salienceAtActiveDay: 0, anchored: false },
      {
        id: 'weak-but-pending',
        salience: 0.1,
        salienceAtActiveDay: 0,
        anchored: true,
      },
    ];

    expect(overCap(topics, 0, 2)).toEqual(['weak']);
    expect(overCap(topics, 0, 3)).toEqual([]);
  });
});

describe('topic naming', () => {
  it('matches a label or alias as whole words, ignoring case and punctuation', () => {
    const topic = { label: 'Renovasi dapur', aliases: ['karyawisata', 'TK'] };

    expect(namesTopic('Soal renovasi dapur, tukangnya datang?', topic)).toBe(
      true,
    );
    expect(namesTopic('KARYAWISATA-nya jadi?', topic)).toBe(true);
    expect(namesTopic('Renovasi kamar mandi dulu', topic)).toBe(false);
    // Names under four characters never count.
    expect(namesTopic('Anak TK libur', topic)).toBe(false);
  });
});

describe('topic lifecycle sweep', () => {
  function topic(id: string, extra: Partial<Topic>): Topic {
    return {
      id,
      userId: 'user-1',
      label: id,
      aliases: [],
      embedding: [],
      status: 'active',
      gateCutoffOffset: 0,
      gateOffsetAtActiveDay: 0,
      episodeCount: 2,
      lastEpisodeKey: null,
      ...base,
      ...extra,
    };
  }

  it('applies each change, spares anchored topics and logs nothing for untouched ones', async () => {
    const updates: Array<[string, TopicUpdate]> = [];
    const deleted: string[] = [];
    const service = new TopicLifecycleService({
      activeDayCount: () => Promise.resolve(130),
      list: () =>
        Promise.resolve([
          topic('quiet', {}),
          topic('pending', {}),
          topic('old-guess', { status: 'candidate', createdAt: daysAgo(40) }),
          topic('fresh', { salience: 3, salienceAtActiveDay: 129 }),
        ]),
      linkedItems: () =>
        Promise.resolve([
          { topicId: 'pending', type: 'reminder', active: true },
          { topicId: 'quiet', type: 'note', active: true },
        ]),
      update: (_userId: string, id: string, patch: TopicUpdate) => {
        updates.push([id, patch]);

        return Promise.resolve();
      },
      deleteTopic: (_userId: string, id: string) => {
        deleted.push(id);

        return Promise.resolve(true);
      },
    } as unknown as ITopicRepository);

    const counts = await service.sweepUser('user-1', now);

    expect(counts).toEqual({ dormant: 1, dismissed: 0, deleted: 1 });
    expect(updates).toEqual([
      ['quiet', { status: 'dormant', statusAtActiveDay: 130 }],
    ]);
    expect(deleted).toEqual(['old-guess']);
  });
});
