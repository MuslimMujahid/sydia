import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { Topic } from '../../database/entities';
import type { ITopicRepository } from '../../database/interfaces';
import {
  DecisionSettings,
  type DecisionGateway,
  type DecisionRequest,
  type DecisionResult,
} from '../../infra/decision-gateway';
import type { EmbeddingsService } from '../../infra/embeddings';
import {
  TopicRecognitionService,
  type TopicRecognitionInput,
} from './topic-recognition.service';

function topic(id: string, embedding: number[], extra: Partial<Topic> = {}) {
  return {
    id,
    userId: 'user-1',
    label: id,
    aliases: [],
    embedding,
    status: 'active',
    salience: 1,
    salienceAtActiveDay: 0,
    gateCutoffOffset: 0,
    gateOffsetAtActiveDay: 0,
    episodeCount: 2,
    lastEpisodeKey: null,
    lastActiveAt: new Date(0),
    createdAt: new Date(0),
    ...extra,
  } satisfies Topic;
}

function setup(options: {
  vector?: number[] | Error;
  answer?: { choice: string; confidence: number } | 'fallback';
  linked?: string[];
}) {
  const decide = jest.fn<(request: DecisionRequest) => Promise<DecisionResult>>(
    () =>
      Promise.resolve(
        options.answer === 'fallback' || !options.answer
          ? { status: 'fallback', reason: 'timeout', latencyMs: 1 }
          : {
              status: 'ok',
              model: 'jev',
              answers: {
                topic: {
                  type: 'choice',
                  choice: options.answer.choice,
                  confidence: options.answer.confidence,
                  probabilities: {},
                },
              },
              inputTokens: 1,
              outputTokens: 1,
              costUsd: null,
              latencyMs: 1,
            },
      ),
  );

  const embed = jest.fn(() =>
    options.vector instanceof Error
      ? Promise.reject(options.vector)
      : Promise.resolve(options.vector ?? [1, 0]),
  );

  const service = new TopicRecognitionService(
    {
      topicsLinkedTo: () => Promise.resolve(options.linked ?? []),
    } as unknown as ITopicRepository,
    { embed } as unknown as EmbeddingsService,
    { decide } satisfies DecisionGateway,
    new DecisionSettings(
      new ConfigService({ BACKEND_TOPIC_RECOGNITION_MODE: 'shadow' }),
    ),
  );

  return { service, decide };
}

const input = (
  topics: Topic[],
  extra: Partial<TopicRecognitionInput> = {},
): TopicRecognitionInput => ({
  userId: 'user-1',
  activeDay: 0,
  latest: 'Bisa bikin janji dokter gigi Selasa sore?',
  recent: [],
  anchors: [],
  stickyTopicId: null,
  topics,
  claims: [],
  mode: 'shadow',
  ...extra,
});

describe('topic recognition', () => {
  it('does not ask the gate when only unconfirmed candidates exist', async () => {
    const { service, decide } = setup({
      answer: { choice: 'a', confidence: 1 },
    });

    const result = await service.recognize(
      input([topic('a', [1, 0], { status: 'candidate' })]),
    );

    expect(result.topicId).toBeNull();
    expect(decide).not.toHaveBeenCalled();
  });

  it('offers only topics above the similarity floor, best first', async () => {
    const { service, decide } = setup({
      answer: { choice: 'near', confidence: 0.9 },
    });

    const result = await service.recognize(
      input([
        topic('far', [0, 1]),
        topic('near', [1, 0.1]),
        topic('closer', [1, 0]),
      ]),
    );

    expect(
      result.candidates.filter((c) => c.offered).map((c) => c.topicId),
    ).toEqual(['closer', 'near']);
    // The near miss is still logged for calibration.
    expect(result.candidates.find((c) => c.topicId === 'far')?.offered).toBe(
      false,
    );
    const criteria = decide.mock.calls[0]?.[0].questions.topic;
    expect(
      criteria?.type === 'choice' && Object.keys(criteria.criteria),
    ).toEqual(['none', 'closer', 'near']);
    expect(result.topicId).toBe('near');
  });

  it('admits a topic linked to the open note even when the words differ', async () => {
    const { service } = setup({
      answer: { choice: 'linked', confidence: 0.8 },
      linked: ['linked'],
    });

    const result = await service.recognize(input([topic('linked', [0, 1])]));

    expect(result.topicId).toBe('linked');
  });

  it('rejects a choice below the cutoff and treats none as no topic', async () => {
    const low = setup({ answer: { choice: 'a', confidence: 0.4 } });
    const none = setup({ answer: { choice: 'none', confidence: 0.95 } });

    expect(
      (await low.service.recognize(input([topic('a', [1, 0])]))).topicId,
    ).toBeNull();
    expect(
      (await none.service.recognize(input([topic('a', [1, 0])]))).topicId,
    ).toBeNull();
  });

  it('asks more of a topic the user recently disconnected', async () => {
    const { service } = setup({ answer: { choice: 'a', confidence: 0.75 } });

    const result = await service.recognize(
      input([topic('a', [1, 0], { gateCutoffOffset: 0.3 })]),
    );

    expect(result.choice).toBe('a');
    expect(result.topicId).toBeNull();
  });

  it('keeps the candidates but recognizes nothing when the gate fails', async () => {
    const { service } = setup({ answer: 'fallback' });

    const result = await service.recognize(input([topic('a', [1, 0])]));

    expect(result.candidates).toHaveLength(1);
    expect(result.topicId).toBeNull();
  });

  it('falls back to anchored and episode topics when embedding fails', async () => {
    const { service } = setup({
      vector: new Error('provider down'),
      answer: { choice: 'sticky', confidence: 0.9 },
    });

    const result = await service.recognize(
      input([topic('sticky', [1, 0]), topic('other', [1, 0])], {
        stickyTopicId: 'sticky',
      }),
    );

    expect(
      result.candidates.filter((c) => c.offered).map((c) => c.topicId),
    ).toEqual(['sticky']);
    expect(result.topicId).toBe('sticky');
  });
});
