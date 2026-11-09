import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import { billingTestAccess } from '../../../../test/support/billing-fixtures';
import {
  CONVERSATION_REPOSITORY,
  type IConversationRepository,
} from '../../../database/interfaces';
import {
  LANGUAGE_MODEL,
  type LanguageModelGateway,
} from '../../../infra/model-gateway';
import { QueueService } from '../../../infra/queue';
import { BillingAccessService } from '../../billing';
import { MemoryDreamSchedulerService } from '../../memories/memory-dream-scheduler.service';
import { NoteOrganizationService } from '../../notes/note-organization.service';
import { NoteOrganizationSchedulerService } from '../../notes/note-organization-scheduler.service';
import { AssistantOrchestratorService } from './assistant-orchestrator.service';
import { ContextBuilderService } from './context-builder.service';
import { ConversationSummarizerService } from './conversation-summarizer.service';
import { ToolExecutorService } from './tool-executor.service';

test('the main agent receives a record without depending on a separate capture pipeline', async () => {
  const now = new Date('2026-10-31T00:00:00Z');
  const conversation = {
    id: 'note-chat',
    title: 'Pengeluaran',
    createdAt: now,
    updatedAt: now,
  };

  const message = {
    id: 'note-message',
    conversationId: conversation.id,
    role: 'user' as const,
    content: 'Pengeluaran saya hari ini Rp55.000',
    createdAt: now,
  };

  const run = {
    id: 'note-run',
    conversationId: conversation.id,
    assistantMessageId: null,
    status: 'completed',
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };

  const repository = {
    writeUserMessage: jest
      .fn<IConversationRepository['writeUserMessage']>()
      .mockResolvedValue({
        conversation,
        userMessage: message,
        replayed: false,
      }),
    findLatestRunForMessage: jest
      .fn<IConversationRepository['findLatestRunForMessage']>()
      .mockResolvedValue(null),
    createRun: jest
      .fn<IConversationRepository['createRun']>()
      .mockResolvedValue({ ...run, status: 'queued' }),
    findExecutionPlan: () => Promise.resolve(null),
    claimRun: jest
      .fn<IConversationRepository['claimRun']>()
      .mockResolvedValue(true),
    findFirstUserMessageId: () => Promise.resolve(null),
    findRecentContexts: jest
      .fn<IConversationRepository['findRecentContexts']>()
      .mockResolvedValue([]),
    findContext: jest
      .fn<IConversationRepository['findContext']>()
      .mockResolvedValue({
        conversation: {
          id: conversation.id,
          rollingSummary: null,
          summaryThroughMessageId: null,
        },
        messages: [message],
      }),
    completeRun: jest
      .fn<IConversationRepository['completeRun']>()
      .mockResolvedValue({
        assistantRun: run,
        assistantMessage: {
          ...message,
          id: 'answer',
          role: 'assistant',
          content: 'Diterima.',
        },
      }),
    updateRun: jest
      .fn<IConversationRepository['updateRun']>()
      .mockResolvedValue({ ...run, status: 'failed' }),
  } as unknown as IConversationRepository;

  const generate = jest
    .fn<LanguageModelGateway['generate']>()
    .mockResolvedValue({ text: 'Diterima.', usage: {} });

  const model: LanguageModelGateway = {
    provider: 'openrouter',
    model: 'agent-boundary',
    generate,
  };

  const config = new ConfigService();
  const schedule = jest
    .fn<NoteOrganizationSchedulerService['schedule']>()
    .mockResolvedValue(undefined);

  const obsoleteCapture = jest
    .fn<NoteOrganizationService['captureMessage']>()
    .mockRejectedValue(
      new Error('The obsolete capture recipe is unavailable.'),
    );

  const module = await Test.createTestingModule({
    providers: [
      AssistantOrchestratorService,
      { provide: CONVERSATION_REPOSITORY, useValue: repository },
      { provide: LANGUAGE_MODEL, useValue: model },
      {
        provide: ContextBuilderService,
        useValue: new ContextBuilderService(repository, config),
      },
      {
        provide: ConversationSummarizerService,
        useValue: new ConversationSummarizerService(repository, model, config),
      },
      {
        provide: ToolExecutorService,
        useValue: new ToolExecutorService(repository, []),
      },
      {
        provide: QueueService,
        useValue: {
          conversationSummaries: {
            add: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
          },
        },
      },
      {
        provide: MemoryDreamSchedulerService,
        useValue: {
          schedule: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        },
      },
      { provide: BillingAccessService, useValue: billingTestAccess() },
      { provide: NoteOrganizationSchedulerService, useValue: { schedule } },
      {
        provide: NoteOrganizationService,
        useValue: { captureMessage: obsoleteCapture },
      },
    ],
  }).compile();

  const result = await module.get(AssistantOrchestratorService).sendAndWait(
    {
      id: 'note-owner',
      name: 'QA',
      timezone: 'Asia/Makassar',
      locale: 'id',
      persona: 'professional',
      preferredAddress: null,
    },
    { content: message.content, idempotencyKey: 'note-agent-turn' },
  );

  expect(result.assistantRun.status).toBe('completed');
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0]![0].messages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: message.content }),
    ]),
  );
  expect(schedule).toHaveBeenCalledWith(
    'note-owner',
    conversation.id,
    message.id,
  );
  expect(obsoleteCapture).not.toHaveBeenCalled();
  await module.close();
});
