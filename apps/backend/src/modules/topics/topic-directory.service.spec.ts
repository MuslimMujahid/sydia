import type { Topic } from '../../database/entities';
import type { ITopicRepository } from '../../database/interfaces';
import { TopicDirectoryService } from './topic-directory.service';

const topic = (
  id: string,
  status: Topic['status'],
  daysAgo: number,
): Topic => ({
  id,
  userId: 'user-1',
  label: id,
  aliases: id === 'trip' ? ['karyawisata'] : [],
  embedding: [1],
  status,
  salience: 1,
  salienceAtActiveDay: 0,
  gateCutoffOffset: 0,
  gateOffsetAtActiveDay: 0,
  episodeCount: 2,
  lastEpisodeKey: null,
  statusAtActiveDay: 0,
  lastActiveAt: new Date(Date.UTC(2026, 10, 21 - daysAgo)),
  createdAt: new Date(0),
});

describe('topic directory', () => {
  it('lists every kept topic, active first, with its latest state and pending items', async () => {
    const service = new TopicDirectoryService({
      list: () =>
        Promise.resolve([
          topic('closed', 'dismissed', 1),
          topic('guess', 'candidate', 0),
          topic('trip', 'active', 3),
          topic('kitchen', 'active', 1),
        ]),
      claims: () =>
        Promise.resolve([
          { topicId: 'trip', kind: 'next_step', text: 'Bayar iuran' },
          { topicId: 'trip', kind: 'next_step', text: 'Older step' },
        ]),
      linkedItems: () =>
        Promise.resolve([
          { topicId: 'trip', active: true },
          { topicId: 'trip', active: false },
        ]),
    } as unknown as ITopicRepository);

    const entries = await service.list('user-1');

    expect(entries.map(({ topicId, status }) => [topicId, status])).toEqual([
      ['kitchen', 'active'],
      ['trip', 'active'],
      ['guess', 'unconfirmed (mentioned once)'],
      ['closed', 'closed'],
    ]);
    expect(entries[1]).toMatchObject({
      alsoCalled: ['karyawisata'],
      nextStep: 'Bayar iuran',
      pendingItems: 1,
    });
    expect(entries[1]).not.toHaveProperty('embedding');
  });
});
