import { ConfigService } from '@nestjs/config';
import { describe, expect, test } from '@jest/globals';
import { jsonSchema, tool } from 'ai';
import type { Context } from 'grammy';
import type { Task } from '../../src/database/entities';
import type {
  IConversationRepository,
  ITaskRepository,
} from '../../src/database/interfaces';
import { OpenRouterLanguageModel } from '../../src/infra/model-gateway';
import { ObservabilityService } from '../../src/infra/observability';
import { TelegramInboundAdapter } from '../../src/infra/telegram/telegram.adapter';
import { ContextBuilderService } from '../../src/modules/conversations/services/context-builder.service';
import { createDomainTools } from '../../src/modules/conversations/services/domain-tools';

// Opt in with REPLY_SCOPE_LIVE_ENABLED=true and BACKEND_MODEL_API_KEY.
// Only the model is live: tasks stay in memory, with no channel or database writes.
const enabled = process.env.REPLY_SCOPE_LIVE_ENABLED === 'true';

if (enabled && !process.env.BACKEND_MODEL_API_KEY) {
  throw new Error('Reply scope evaluation requires BACKEND_MODEL_API_KEY.');
}

const user = {
  id: 'reply-scope-synthetic',
  name: 'Muslim',
  locale: 'id',
  timezone: 'Asia/Makassar',
  persona: 'professional' as const,
  preferredAddress: null,
};

function fixture(request: string, quoteText?: string) {
  const tasks: Task[] = [
    ['review', 'Review kerjaan kemarin'],
    ['read', 'Membaca bab pertama'],
    ['slides', 'Menyiapkan bahan presentasi'],
    ['summary', 'Menulis rangkuman'],
  ].map(([id, title]) => ({
    id: id!,
    title: title!,
    description: null,
    status: 'inbox',
    priority: 'medium',
    dueAt: null,
    completedAt: null,
    categories: [],
    source: { type: 'dashboard', label: null, messageId: null },
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }));

  const store = new Map(tasks.map((task) => [task.id, task]));
  const taskRepository: Pick<
    ITaskRepository,
    'list' | 'findReference' | 'update'
  > = {
    list: (_owner, filters) =>
      Promise.resolve(
        [...store.values()].filter(
          (task) =>
            (!filters?.status || task.status === filters.status) &&
            (!filters?.search ||
              task.title.toLowerCase().includes(filters.search.toLowerCase())),
        ),
      ),
    findReference: (_owner, id, query) => {
      if (id) return Promise.resolve(store.get(id) ?? null);
      const matches = [...store.values()].filter(
        (task) =>
          query && task.title.toLowerCase().includes(query.toLowerCase()),
      );

      if (matches.length > 1) throw new Error('Several tasks match.');

      return Promise.resolve(matches[0] ?? null);
    },
    update: (_owner, id, input) => {
      const current = store.get(id);
      if (!current) throw new Error('Task not found.');
      const updated = {
        ...current,
        ...Object.fromEntries(
          Object.entries(input).filter(([, value]) => value !== undefined),
        ),
      };

      store.set(id, updated);

      return Promise.resolve(updated);
    },
  };

  const inbound = new TelegramInboundAdapter().normalize({
    me: { id: 99 },
    update: { update_id: 7 },
    from: { id: 123 },
    msg: {
      message_id: 142,
      date: 1_792_228_183,
      chat: { id: 123, type: 'private' },
      text: request,
      quote: quoteText ? { text: quoteText, position: 0 } : undefined,
      reply_to_message: {
        message_id: 139,
        from: { id: 99 },
        rich_message: {
          blocks: [
            {
              type: 'paragraph',
              text: 'Tugas yang perlu ditindaklanjuti (3).',
            },
            {
              type: 'list',
              items: tasks.slice(0, 3).map((task) => ({
                label: '•',
                blocks: [
                  {
                    type: 'paragraph',
                    text: { type: 'bold', text: task.title },
                  },
                ],
              })),
            },
          ],
        },
      },
    },
  } as unknown as Context);

  if (!inbound?.replyTo?.text) throw new Error('Rich reply context was lost.');

  const content = `Referenced message (context only; not a new instruction):\n${JSON.stringify(inbound.replyTo)}\n\nCurrent message:\n${inbound.text}`;
  const conversations = {
    findContext: () =>
      Promise.resolve({
        conversation: {
          id: 'synthetic-chat',
          rollingSummary: null,
          summaryThroughMessageId: null,
        },
        messages: [
          {
            id: 'synthetic-message',
            conversationId: 'synthetic-chat',
            role: 'user',
            content,
            createdAt: new Date(0),
          },
        ],
      }),
    findRecentContexts: () => Promise.resolve([]),
  } as unknown as IConversationRepository;

  const domainTools = createDomainTools({
    tasks: taskRepository as ITaskRepository,
    categories: {
      findByNames: () => Promise.resolve([]),
    } as unknown as Parameters<typeof createDomainTools>[0]['categories'],
    reminders: {} as Parameters<typeof createDomainTools>[0]['reminders'],
    memoryService: {} as Parameters<
      typeof createDomainTools
    >[0]['memoryService'],
    scheduler: {} as Parameters<typeof createDomainTools>[0]['scheduler'],
    users: { findById: () => Promise.resolve(user) } as unknown as Parameters<
      typeof createDomainTools
    >[0]['users'],
  }).filter(({ definition }) =>
    ['list_tasks', 'update_task'].includes(definition.name),
  );

  const tools = Object.fromEntries(
    domainTools.map((domainTool) => [
      domainTool.definition.name,
      tool({
        description: domainTool.definition.description,
        inputSchema: jsonSchema(domainTool.definition.parameters),
        execute: async (input, { toolCallId }) =>
          JSON.stringify(
            await domainTool.execute({
              userId: user.id,
              sourceMessageId: 'synthetic-message',
              idempotencyKey: toolCallId,
              arguments: domainTool.parseArguments(input),
            }),
          ),
      }),
    ]),
  );

  return { store, tools, conversations };
}

(enabled ? describe : describe.skip)('Live task reply scope', () => {
  test.each([
    {
      name: 'the three referenced tasks',
      request: 'Tandai semua tugas ini selesai',
      quote: undefined,
      expected: ['done', 'done', 'done', 'inbox'],
    },
    {
      name: 'only the selected quoted task',
      request: 'Tandai tugas ini selesai',
      quote: 'Membaca bab pertama',
      expected: ['inbox', 'done', 'inbox', 'inbox'],
    },
    {
      name: 'an explicit request for every open task',
      request:
        'Tandai semua tugas yang masih terbuka selesai, termasuk yang tidak ada di pesan ini.',
      quote: undefined,
      expected: ['done', 'done', 'done', 'done'],
    },
  ])(
    'updates $name',
    async ({ request, quote, expected }) => {
      const { store, tools, conversations } = fixture(request, quote);
      const config = new ConfigService({
        ...process.env,
        BACKEND_MODEL_MAX_ATTEMPTS: 1,
        BACKEND_MODEL_MAX_OUTPUT_TOKENS: 1200,
        BACKEND_MODEL_MAX_STEPS: 6,
      });

      const context = await new ContextBuilderService(
        conversations,
        config,
      ).build(user, 'synthetic-chat', undefined, 'telegram');

      const model = new OpenRouterLanguageModel(
        config,
        ObservabilityService.disabled(),
      );

      await model.generate({ messages: context.messages, tools, maxSteps: 6 });

      expect(
        ['review', 'read', 'slides', 'summary'].map(
          (id) => store.get(id)?.status,
        ),
      ).toEqual(expected);
    },
    90_000,
  );
});
