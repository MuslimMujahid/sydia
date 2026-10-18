import { ConfigService } from '@nestjs/config';
import { describe, expect, test } from '@jest/globals';
import { jsonSchema, tool } from 'ai';
import type { Task } from '../../src/database/entities';
import type {
  IConversationRepository,
  ITaskRepository,
} from '../../src/database/interfaces';
import { OpenRouterLanguageModel } from '../../src/infra/model-gateway';
import { ObservabilityService } from '../../src/infra/observability';
import { dayWindow } from '../../src/shared/date-time';
import { ContextBuilderService } from '../../src/modules/conversations/services/context-builder.service';
import { createDomainTools } from '../../src/modules/conversations/services/domain-tools';

// Only the model is live. Task data is synthetic; no database or channel writes.
const enabled = process.env.TASK_LISTS_LIVE_ENABLED === 'true';
if (enabled && !process.env.BACKEND_MODEL_API_KEY)
  throw new Error('Task-list evaluation requires BACKEND_MODEL_API_KEY.');

const user = {
  id: 'task-list-synthetic',
  name: 'Demo User',
  timezone: 'Asia/Makassar',
  locale: 'id',
  persona: 'professional' as const,
  preferredAddress: null,
};

function fixture(channel: 'telegram' | 'whatsapp' | undefined) {
  const tomorrow = dayWindow(
    dayWindow(new Date(), user.timezone).end,
    user.timezone,
  );

  const dueAt = new Date(tomorrow.end.getTime() - 3_600_000);
  const makeTask = (
    id: string,
    title: string,
    status: Task['status'] = 'inbox',
  ): Task => ({
    id,
    title,
    status,
    dueAt,
    description: null,
    priority: 'medium',
    completedAt: status === 'done' ? new Date(0) : null,
    categories: [],
    source: { type: 'dashboard', label: null, messageId: null },
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });

  const tasks = [
    makeTask('read', 'Membaca bab pertama'),
    makeTask('exercise', 'Mengerjakan latihan'),
    makeTask('summary', 'Menulis rangkuman'),
    makeTask('old-summary', 'Menulis rangkuman', 'done'),
  ];

  const filtersUsed: unknown[] = [];
  const repository: Pick<ITaskRepository, 'list'> = {
    list: (_owner, filters) => {
      filtersUsed.push(filters);

      return Promise.resolve(
        tasks.filter(
          (task) =>
            (!filters?.status || task.status === filters.status) &&
            (!filters?.dueRange ||
              (task.dueAt! >= filters.dueRange.from &&
                task.dueAt! < filters.dueRange.to)),
        ),
      );
    },
  };

  const domain = createDomainTools({
    tasks: repository as ITaskRepository,
    users: { findById: () => Promise.resolve(user) } as unknown as Parameters<
      typeof createDomainTools
    >[0]['users'],
    categories: {} as Parameters<typeof createDomainTools>[0]['categories'],
    reminders: {} as Parameters<typeof createDomainTools>[0]['reminders'],
    memoryService: {} as Parameters<
      typeof createDomainTools
    >[0]['memoryService'],
    scheduler: {} as Parameters<typeof createDomainTools>[0]['scheduler'],
  }).find(({ definition }) => definition.name === 'list_tasks');

  if (!domain) throw new Error('list_tasks must be registered');
  const tools = {
    list_tasks: tool({
      description: domain.definition.description,
      inputSchema: jsonSchema(domain.definition.parameters),
      execute: async (input, { toolCallId }) =>
        JSON.stringify(
          await domain.execute({
            userId: user.id,
            sourceMessageId: 'request',
            idempotencyKey: toolCallId,
            arguments: domain.parseArguments(input),
          }),
        ),
    }),
  };

  const config = new ConfigService({
    ...process.env,
    BACKEND_MODEL_MAX_ATTEMPTS: 1,
    BACKEND_MODEL_MAX_OUTPUT_TOKENS: 1200,
    BACKEND_MODEL_MAX_STEPS: 6,
  });

  const conversations = {
    findContext: () =>
      Promise.resolve({
        conversation: {
          id: 'new-chat',
          rollingSummary: null,
          summaryThroughMessageId: null,
        },
        messages: [
          {
            id: 'request',
            role: 'user',
            content: 'Ada tugas apa aja besok?',
            createdAt: new Date(0),
          },
        ],
      }),
    findRecentContexts: () =>
      Promise.resolve([
        {
          id: 'previous-chat',
          title: 'Ada tugas apa aja besok?',
          rollingSummary: null,
          lastMessageAt: new Date(),
          messages: [
            {
              role: 'assistant',
              createdAt: new Date(),
              content:
                'Ada 3 tugas yang jatuh tempo besok, Demo User.\n\n- Membaca bab pertama\n- Mengerjakan latihan\n- Menulis rangkuman',
            },
          ],
        },
      ]),
  } as unknown as IConversationRepository;

  return {
    tools,
    filtersUsed,
    config,
    context: new ContextBuilderService(conversations, config).build(
      user,
      'new-chat',
      'request',
      channel,
    ),
  };
}

(enabled ? describe : describe.skip)('Live current task lists', () => {
  test.each([undefined, 'telegram', 'whatsapp'] as const)(
    'looks up tasks again despite an identical historical answer on %s',
    async (channel) => {
      const { tools, filtersUsed, config, context } = fixture(channel);
      const { messages } = await context;
      const result = await new OpenRouterLanguageModel(
        config,
        ObservabilityService.disabled(),
      ).generate({ messages, tools });

      expect(filtersUsed).toContainEqual(
        expect.objectContaining({
          status: 'inbox',
          dueRange: expect.any(Object),
        }),
      );
      expect(result.text).toContain('Membaca bab pertama');
      expect(result.text).toContain('Mengerjakan latihan');
      expect(result.text).toContain('Menulis rangkuman');
      if (channel === undefined) {
        expect(result.text).toContain('](#task/read)');
        expect(result.text).toContain('](#task/exercise)');
        expect(result.text).toContain('](#task/summary)');
      } else expect(result.text).not.toContain('#task/');
    },
    180_000,
  );
});
