import { jest } from '@jest/globals';
import type { Topic } from '../../database/entities';
import type {
  ITopicRepository,
  NewTopicEvent,
  TopicUpdate,
} from '../../database/interfaces';
import type { ApiException } from '../../shared/errors';
import type { EmbeddingsService } from '../../infra/embeddings';
import { TopicDisconnectService } from './topic-disconnect.service';

/** The refusal text the model receives (the tool executor reads it from the response). */
async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (
      (error as ApiException).getResponse() as { error: { message: string } }
    ).error.message;
  }

  throw new Error('Expected the disconnect to be refused.');
}

const topic: Topic = {
  id: 't-1',
  userId: 'user-1',
  label: 'Renovasi dapur',
  aliases: [],
  embedding: [],
  status: 'active',
  salience: 3,
  salienceAtActiveDay: 5,
  gateCutoffOffset: 0.25,
  gateOffsetAtActiveDay: 5,
  episodeCount: 3,
  lastEpisodeKey: 'c-1:m-1',
  statusAtActiveDay: 0,
  lastActiveAt: new Date(),
  createdAt: new Date(),
};

function setup(options: { linked?: boolean; exists?: boolean } = {}) {
  const updates: TopicUpdate[] = [];
  const events: NewTopicEvent[] = [];
  const suppress = jest.fn(() => Promise.resolve());
  const deleteTopic = jest.fn(() => Promise.resolve(true));
  const removeLink = jest.fn(() => Promise.resolve(options.linked ?? true));
  const linked: Array<{ topicId: string; items: unknown[]; origin: string }> =
    [];

  const repository = {
    find: () => Promise.resolve(options.exists === false ? null : topic),
    activeDayCount: () => Promise.resolve(5),
    conversationState: () => Promise.resolve({ episodeKey: 'c-1:m-1' }),
    suppress,
    recordEvent: (event: NewTopicEvent) => {
      events.push(event);

      return Promise.resolve(true);
    },
    update: (_userId: string, _id: string, patch: TopicUpdate) => {
      updates.push(patch);

      return Promise.resolve();
    },
    removeLink,
    deleteTopic,
    linkedItems: () =>
      Promise.resolve([
        { topicId: 't-1', type: 'reminder', id: 'r-1', active: true },
        { topicId: 't-1', type: 'task', id: 'k-1', active: true },
      ]),
    create: (input: { label: string }) =>
      Promise.resolve({
        ...topic,
        id: 't-new',
        label: input.label,
        status: 'candidate',
      }),
    linkItems: (topicId: string, items: unknown[], origin: string) => {
      linked.push({ topicId, items, origin });

      return Promise.resolve(items.length);
    },
  } as unknown as ITopicRepository;

  return {
    service: new TopicDisconnectService(repository, {
      embed: () => Promise.resolve([1, 0]),
    } as unknown as EmbeddingsService),
    linked,
    updates,
    events,
    suppress,
    removeLink,
    deleteTopic,
  };
}

describe('topic disconnect', () => {
  it('suppresses the topic for the episode, takes back its credit and raises its cutoff', async () => {
    const { service, updates, events, suppress } = setup();

    const result = await service.disconnect('user-1', 'c-1', {
      topicId: 't-1',
      scope: 'episode',
    });

    expect(result.status).toBe('done');
    expect(suppress).toHaveBeenCalledWith('t-1', 'c-1');
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'disconnect',
        weight: -1,
        episodeKey: 'c-1:m-1',
      }),
    ]);
    // 3 - 1 (this episode's credit) - 1 (penalty); the cutoff offset caps at 0.3.
    expect(updates[0]).toMatchObject({ salience: 1, gateCutoffOffset: 0.3 });
  });

  it('needs a conversation to scope an episode disconnect', async () => {
    const { service, suppress } = setup();

    expect(
      await refusal(
        service.disconnect('user-1', undefined, {
          topicId: 't-1',
          scope: 'episode',
        }),
      ),
    ).toContain('Changed nothing');
    expect(suppress).not.toHaveBeenCalled();
  });

  it('removes one item link, and refuses an item that is not linked', async () => {
    const linked = setup();
    await linked.service.disconnect('user-1', 'c-1', {
      topicId: 't-1',
      scope: 'item',
      itemType: 'reminder',
      itemId: 'r-1',
    });
    expect(linked.removeLink).toHaveBeenCalledWith('user-1', 't-1', {
      type: 'reminder',
      id: 'r-1',
    });

    expect(
      await refusal(
        setup({ linked: false }).service.disconnect('user-1', 'c-1', {
          topicId: 't-1',
          scope: 'item',
          itemType: 'reminder',
          itemId: 'r-9',
        }),
      ),
    ).toContain('not linked');
  });

  it('closes a finished topic and deletes a forgotten one', async () => {
    const closed = setup();
    await closed.service.disconnect('user-1', 'c-1', {
      topicId: 't-1',
      scope: 'topic_complete',
    });
    expect(closed.updates[0]).toEqual({
      status: 'dismissed',
      dismissedReason: 'completed',
      statusAtActiveDay: 5,
    });

    const forgotten = setup();
    await forgotten.service.disconnect('user-1', 'c-1', {
      topicId: 't-1',
      scope: 'topic_forget',
    });
    expect(forgotten.deleteTopic).toHaveBeenCalledWith('user-1', 't-1');
  });

  it('changes nothing for a topic the user does not own', async () => {
    const { service, deleteTopic } = setup({ exists: false });

    expect(
      await refusal(
        service.disconnect('user-1', 'c-1', {
          topicId: 't-1',
          scope: 'topic_forget',
        }),
      ),
    ).toContain('does not exist');
    expect(deleteTopic).not.toHaveBeenCalled();
  });

  it('splits named items into a new confirmed topic the user named', async () => {
    const { service, removeLink, linked, updates } = setup();

    await service.disconnect('user-1', 'c-1', {
      topicId: 't-1',
      scope: 'split',
      newLabel: 'Renovasi kamar mandi',
      items: [{ type: 'task', id: 'k-1' }],
    });

    expect(removeLink).toHaveBeenCalledWith('user-1', 't-1', {
      type: 'task',
      id: 'k-1',
    });
    expect(linked).toEqual([
      {
        topicId: 't-new',
        items: [{ type: 'task', id: 'k-1' }],
        origin: 'user_stated',
      },
    ]);
    expect(updates.at(-1)).toMatchObject({
      status: 'active',
      embedding: [1, 0],
    });
  });

  it('refuses to split items the topic does not hold, before creating anything', async () => {
    const { service, linked } = setup();

    expect(
      await refusal(
        service.disconnect('user-1', 'c-1', {
          topicId: 't-1',
          scope: 'split',
          newLabel: 'Lain',
          items: [{ type: 'task', id: 'not-linked' }],
        }),
      ),
    ).toContain('not linked');
    expect(linked).toEqual([]);
  });
});
