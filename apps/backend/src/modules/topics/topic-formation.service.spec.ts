import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type {
  Topic,
  TopicClaim,
  TopicConversationState,
  TopicItemRef,
  TopicSourceInvocation,
  TopicSourceMessage,
} from '../../database/entities';
import type {
  ITopicRepository,
  IUserRepository,
  NewTopicEvent,
  NewTopicRecognitionLog,
} from '../../database/interfaces';
import { DecisionSettings } from '../../infra/decision-gateway';
import type { EmbeddingsService } from '../../infra/embeddings';
import type {
  GenerateRequest,
  LanguageModelGateway,
} from '../../infra/model-gateway';
import { TopicFormationService } from './topic-formation.service';
import type {
  TopicRecognition,
  TopicRecognitionService,
} from './topic-recognition.service';

const HOUR = 3_600_000;
const start = new Date('2026-11-21T02:00:00.000Z');
const at = (hours: number) => new Date(start.getTime() + hours * HOUR);

/** Topic store kept in memory, with the same suppression and uniqueness rules. */
class MemoryTopicRepository implements ITopicRepository {
  topics: Topic[] = [];
  claimRows: TopicClaim[] = [];
  links: Array<TopicItemRef & { topicId: string; removed: boolean }> = [];
  events: NewTopicEvent[] = [];
  states = new Map<string, TopicConversationState>();
  logs: NewTopicRecognitionLog[] = [];
  activeDays = 0;
  lastDay: string | null = null;
  messages: TopicSourceMessage[] = [];
  invocations: TopicSourceInvocation[] = [];

  list(_userId: string, statuses: readonly string[]) {
    return Promise.resolve(
      this.topics.filter((topic) => statuses.includes(topic.status)),
    );
  }

  claims(topicIds: readonly string[]) {
    return Promise.resolve(
      this.claimRows.filter((claim) => topicIds.includes(claim.topicId)),
    );
  }

  topicsLinkedTo() {
    return Promise.resolve([]);
  }

  hasActionableLink(topicId: string) {
    return Promise.resolve(
      this.links.some(
        (link) =>
          link.topicId === topicId &&
          !link.removed &&
          ['reminder', 'task', 'calendar_event'].includes(link.type),
      ),
    );
  }

  create(input: Parameters<ITopicRepository['create']>[0]) {
    const topic: Topic = {
      id: `topic-${this.topics.length + 1}`,
      userId: input.userId,
      label: input.label,
      aliases: input.aliases,
      embedding: [],
      status: 'candidate',
      salience: 1,
      salienceAtActiveDay: input.activeDay,
      gateCutoffOffset: 0,
      gateOffsetAtActiveDay: 0,
      episodeCount: 1,
      lastEpisodeKey: input.episodeKey,
      lastActiveAt: input.at,
      createdAt: input.at,
    };

    this.topics.push(topic);

    return Promise.resolve(topic);
  }

  update(_userId: string, topicId: string, patch: Partial<Topic>) {
    Object.assign(
      this.topics.find(({ id }) => id === topicId)!,
      patch,
    );

    return Promise.resolve();
  }

  linkItems(topicId: string, items: readonly TopicItemRef[]) {
    let added = 0;

    for (const item of items) {
      if (
        this.links.some(
          (link) =>
            link.topicId === topicId &&
            link.type === item.type &&
            link.id === item.id,
        )
      )
        continue;
      this.links.push({ ...item, topicId, removed: false });
      added += 1;
    }

    return Promise.resolve(added);
  }

  addClaims(
    topicId: string,
    claims: Parameters<ITopicRepository['addClaims']>[1],
  ) {
    for (const claim of claims)
      this.claimRows.unshift({
        id: `claim-${this.claimRows.length}`,
        topicId,
        createdAt: new Date(),
        ...claim,
      });

    return Promise.resolve();
  }

  removeClaims(topicId: string, claimIds: readonly string[]) {
    this.claimRows = this.claimRows.filter(
      (claim) => claim.topicId !== topicId || !claimIds.includes(claim.id),
    );

    return Promise.resolve();
  }

  recordEvent(input: NewTopicEvent) {
    if (
      this.events.some(
        (event) =>
          event.topicId === input.topicId &&
          event.episodeKey === input.episodeKey &&
          event.kind === input.kind,
      )
    )
      return Promise.resolve(false);
    this.events.push(input);

    return Promise.resolve(true);
  }

  conversationState(conversationId: string) {
    return Promise.resolve(this.states.get(conversationId) ?? null);
  }

  saveConversationState(state: TopicConversationState) {
    this.states.set(state.conversationId, { ...state });

    return Promise.resolve();
  }

  touchActiveDay(_userId: string, day: string) {
    if (!this.lastDay || this.lastDay < day) {
      this.activeDays += 1;
      this.lastDay = day;
    }

    return Promise.resolve(this.activeDays);
  }

  formationInput(_userId: string, _conversationId: string, after: Date | null) {
    const messages = this.messages.filter(
      (message) => !after || message.createdAt > after,
    );

    return Promise.resolve({
      messages,
      invocations: this.invocations.filter((call) =>
        messages.some((message) => message.id === call.inputMessageId),
      ),
    });
  }

  logRecognition(input: NewTopicRecognitionLog) {
    this.logs.push(input);

    return Promise.resolve();
  }
}

type Payload = {
  topics: Array<{
    id: string;
    state: Array<{ ref: string; kind: string; text: string }>;
  }>;
};

type Extraction = {
  resolved?: string[];
  action: 'existing' | 'new' | 'none';
  topicId?: string;
  label?: string;
  aliases?: string[];
  linkedItems?: number[];
  claims?: Array<{
    kind: string;
    text: string;
    explicit: boolean;
    messageIndex: number;
  }>;
};

function setup(
  options: {
    mode?: string;
    memoryEnabled?: boolean;
    recognition?: Partial<TopicRecognition>;
  } = {},
) {
  const repository = new MemoryTopicRepository();
  const outputs: Array<Extraction | ((payload: Payload) => Extraction)> = [];
  const generate = jest.fn((request: GenerateRequest) => {
    const queued = outputs.shift() ?? { action: 'none' };
    const next =
      typeof queued === 'function'
        ? queued(JSON.parse(request.messages[1]?.content as string) as Payload)
        : queued;

    return Promise.resolve({
      text: JSON.stringify({
        topicId: null,
        label: null,
        aliases: [],
        linkedItems: [],
        claims: [],
        ...next,
      }),
    });
  });

  const recognize = jest.fn(() =>
    Promise.resolve({
      candidates: [],
      choice: null,
      confidence: null,
      topicId: null,
      ...options.recognition,
    } satisfies TopicRecognition),
  );

  const service = new TopicFormationService(
    repository,
    {
      findById: () =>
        Promise.resolve({
          id: 'user-1',
          timezone: 'Asia/Jakarta',
          automaticMemoryEnabled: options.memoryEnabled ?? true,
        }),
    } as unknown as IUserRepository,
    { generate } as unknown as LanguageModelGateway,
    { embed: () => Promise.resolve([1, 0]) } as unknown as EmbeddingsService,
    new DecisionSettings(
      new ConfigService({
        BACKEND_TOPIC_RECOGNITION_MODE: options.mode ?? 'shadow',
      }),
    ),
    { recognize } as unknown as TopicRecognitionService,
    new ConfigService({ BACKEND_CHANNEL_CONVERSATION_IDLE_MS: 4 * HOUR }),
  );

  let count = 0;

  const say = (
    content: string,
    when: Date,
    role: 'user' | 'assistant' = 'user',
  ) => {
    const message: TopicSourceMessage = {
      id: `m-${++count}`,
      role,
      content,
      createdAt: when,
      activeNoteRef: null,
      sourceNoteRefs: [],
      sourceDocumentIds: [],
    };

    repository.messages.push(message);

    return message;
  };

  return { service, repository, outputs, generate, say, recognize };
}

const run = (service: TopicFormationService) =>
  service.process('user-1', 'conversation-1');

describe('topic formation', () => {
  it('does nothing while the feature is off', async () => {
    const { service, repository, say, generate } = setup({ mode: 'off' });
    say('Anak study tour Selasa depan', at(0));

    await run(service);

    expect(generate).not.toHaveBeenCalled();
    expect(repository.states.size).toBe(0);
  });

  it('skips content when automatic memory is off, without backfilling it later', async () => {
    const { service, repository, say, generate } = setup({
      memoryEnabled: false,
    });

    say('Anak study tour Selasa depan', at(0));

    await run(service);

    expect(generate).not.toHaveBeenCalled();
    expect(repository.topics).toHaveLength(0);
    expect(repository.states.get('conversation-1')?.processedThroughAt).toEqual(
      at(0),
    );
  });

  it('never sends credential-bearing messages to the model', async () => {
    const { service, say, generate } = setup();
    say('password wifi sekolah: Rahasia123!', at(0));

    await run(service);

    expect(generate).not.toHaveBeenCalled();
  });

  it('creates a candidate topic with its claims and only the items that serve it', async () => {
    const { service, repository, outputs, say } = setup();
    const message = say(
      'Anak study tour Selasa depan, iurannya belum bayar',
      at(0),
    );

    repository.invocations.push(
      {
        inputMessageId: message.id,
        name: 'create_reminder',
        arguments: {},
        result: { reminders: [{ id: 'r-fee', title: 'Bayar iuran' }] },
      },
      {
        inputMessageId: message.id,
        name: 'create_task',
        arguments: {},
        result: {
          objectType: 'task',
          object: { id: 't-milk', title: 'Beli susu' },
        },
      },
    );
    outputs.push({
      action: 'new',
      label: 'Study tour anak',
      aliases: ['karyawisata'],
      linkedItems: [0],
      claims: [
        {
          kind: 'open_question',
          text: 'Iuran belum dibayar',
          explicit: true,
          messageIndex: 0,
        },
      ],
    });

    await run(service);

    const [topic] = repository.topics;
    expect(topic).toMatchObject({
      label: 'Study tour anak',
      aliases: ['karyawisata'],
    });
    expect(repository.links.map(({ type, id }) => ({ type, id }))).toEqual([
      { type: 'reminder', id: 'r-fee' },
    ]);
    expect(repository.claimRows).toEqual([
      expect.objectContaining({
        text: 'Iuran belum dibayar',
        messageId: message.id,
      }),
    ]);
    // A linked reminder makes it an active effort right away (TOPIC-FORM-03).
    expect(topic?.status).toBe('active');
    expect(topic?.embedding).toEqual([1, 0]);
  });

  it('keeps a one-off topic without items as a candidate', async () => {
    const { service, repository, outputs, say } = setup();
    say('Mau renovasi dapur tahun depan', at(0));
    outputs.push({ action: 'new', label: 'Renovasi dapur' });

    await run(service);

    expect(repository.topics[0]?.status).toBe('candidate');
  });

  it('confirms a candidate when it comes up in a second episode, counting salience once per episode', async () => {
    const { service, repository, outputs, say } = setup();
    say('Mau renovasi dapur tahun depan', at(0));
    outputs.push({ action: 'new', label: 'Renovasi dapur' });
    await run(service);

    // Same episode: no second salience event.
    say('Kira-kira budgetnya berapa ya', at(1));
    outputs.push({ action: 'existing', topicId: 'topic-1' });
    await run(service);
    expect(repository.events).toHaveLength(1);
    expect(repository.topics[0]?.status).toBe('candidate');

    // After the idle window: a new episode counts and confirms the topic.
    say('Soal renovasi dapur, tukangnya sudah ada', at(6));
    outputs.push({ action: 'existing', topicId: 'topic-1' });
    await run(service);

    const topic = repository.topics[0]!;
    expect(repository.events).toHaveLength(2);
    expect(topic.episodeCount).toBe(2);
    expect(topic.status).toBe('active');
    expect(topic.salience).toBeCloseTo(2);
  });

  it('splits messages separated by the idle window into separate episodes', async () => {
    const { service, repository, say, generate } = setup();
    say('Halo', at(0));
    say('Halo lagi', at(5));

    await run(service);

    expect(generate).toHaveBeenCalledTimes(2);
    expect(repository.states.get('conversation-1')).toMatchObject({
      processedThroughAt: at(5),
      episodeKey: 'conversation-1:m-2',
    });
  });

  it('ignores an assignment to a topic it was not shown', async () => {
    const { service, repository, outputs, say } = setup();
    say('Soal itu tadi', at(0));
    outputs.push({ action: 'existing', topicId: 'made-up' });

    await run(service);

    expect(repository.topics).toHaveLength(0);
    expect(repository.events).toHaveLength(0);
  });

  it('logs what the gate would have recognized next to the topic formation assigned', async () => {
    const { service, repository, outputs, say } = setup({
      recognition: {
        candidates: [
          {
            topicId: 'topic-1',
            status: 'active',
            similarity: 0.8,
            salience: 1,
            score: 0.85,
            offered: true,
          },
        ],
        choice: 'topic-1',
        confidence: 0.9,
        topicId: 'topic-1',
      },
    });

    say('Renovasi dapur', at(0));
    outputs.push({ action: 'new', label: 'Renovasi dapur' });

    await run(service);

    expect(repository.logs).toEqual([
      expect.objectContaining({
        messageId: 'm-1',
        mode: 'shadow',
        accepted: true,
        assignedTopicId: 'topic-1',
      }),
    ]);
  });

  it('replaces a step the user finished and ignores refs of other topics', async () => {
    const { service, repository, outputs, say } = setup();
    say('Study tour Selasa, iuran harus dibayar Jumat', at(0));
    outputs.push({
      action: 'new',
      label: 'Study tour',
      claims: [
        {
          kind: 'next_step',
          text: 'Bayar iuran Jumat',
          explicit: true,
          messageIndex: 0,
        },
      ],
    });
    await run(service);
    say('Pesta Raka hari Minggu di rumah', at(6));
    outputs.push({
      action: 'new',
      label: 'Pesta Raka',
      claims: [
        {
          kind: 'decision',
          text: 'Pesta di rumah',
          explicit: true,
          messageIndex: 0,
        },
      ],
    });
    await run(service);

    say('Iuran study tour sudah aku transfer', at(12));
    outputs.push((payload) => {
      const refOf = (text: string) =>
        payload.topics
          .flatMap((topic) => topic.state)
          .find((entry) => entry.text === text)!.ref;

      return {
        action: 'existing',
        topicId: 'topic-1',
        resolved: [refOf('Bayar iuran Jumat'), refOf('Pesta di rumah')],
        claims: [
          {
            kind: 'decision',
            text: 'Iuran sudah ditransfer',
            explicit: true,
            messageIndex: 0,
          },
        ],
      };
    });
    await run(service);

    expect(
      repository.claimRows.map(({ topicId, text }) => [topicId, text]),
    ).toEqual([
      ['topic-1', 'Iuran sudah ditransfer'],
      ['topic-2', 'Pesta di rumah'],
    ]);
  });

  it('reads only messages after the saved cursor', async () => {
    const { service, say, generate } = setup();
    say('Halo', at(0));
    await run(service);
    say('Apa kabar', at(1));
    await run(service);

    const lastCall = generate.mock.calls.at(-1)?.[0];
    const payload = JSON.parse(lastCall?.messages[1]?.content as string) as {
      messages: Array<{ content: string }>;
    };

    expect(payload.messages.map(({ content }) => content)).toEqual([
      'Apa kabar',
    ]);
  });
});
