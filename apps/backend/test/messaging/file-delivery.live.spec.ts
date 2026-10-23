import { ConfigService } from '@nestjs/config';
import { describe, expect, jest, test } from '@jest/globals';
import { jsonSchema, tool } from 'ai';
import type { DocumentMetadata } from '../../src/database/entities';
import type {
  IConversationRepository,
  IDocumentRepository,
} from '../../src/database/interfaces';
import { DecisionSettings } from '../../src/infra/decision-gateway';
import { TypeSafeDecisionGateway } from '../../src/infra/decision-gateway/typesafe-decision.gateway';
import type { DecisionCapacityService } from '../../src/infra/decision-gateway/decision-capacity.service';
import { OpenRouterLanguageModel } from '../../src/infra/model-gateway';
import { ObservabilityService } from '../../src/infra/observability';
import { ContextBuilderService } from '../../src/modules/conversations/services/context-builder.service';
import { TurnDecisionService } from '../../src/modules/conversations/services/turn-decision.service';
import { createPhaseTools } from '../../src/modules/conversations/services/phase-tools';
import {
  buildTerminalToolResponse,
  terminalToolInputSchema,
} from '../../src/modules/conversations/services/terminal-tool-response';
import type { AssistantFile } from '../../src/modules/conversations/services/tool-executor.service';

// Live classifier and assistant, synthetic documents and attachment transport.
// No database writes, real identity documents, or WhatsApp/Telegram sends.
const enabled = process.env.FILE_DELIVERY_LIVE_ENABLED === 'true';
const user = {
  id: 'synthetic-file-delivery',
  name: 'Demo User',
  timezone: 'Asia/Makassar',
  locale: 'id',
  persona: 'professional' as const,
  preferredAddress: null,
};

const saved: DocumentMetadata = {
  id: 'synthetic-id-photo',
  title: 'KTP_Demo.jpg',
  description: null,
  status: 'ready',
  createdAt: new Date(0),
  updatedAt: new Date(0),
  file: {
    id: 'synthetic-asset',
    originalName: 'KTP_Demo.jpg',
    mimeType: 'image/jpeg',
    size: 123,
    kind: 'image',
    createdAt: new Date(0),
  },
};

(enabled ? describe : describe.skip)(
  'Live file delivery on the first request',
  () => {
    test.each(['whatsapp', 'telegram'] as const)(
      'delivers the attachment before completing the %s turn',
      async (channel) => {
        if (!process.env.BACKEND_MODEL_API_KEY)
          throw new Error(
            'FILE_DELIVERY_LIVE_ENABLED requires BACKEND_MODEL_API_KEY',
          );
        const config = new ConfigService({
          ...process.env,
          BACKEND_TOOL_GROUP_SELECTION_MODE: 'enabled',
          BACKEND_DECISION_COHORT: user.id,
          BACKEND_DECISION_TIMEOUT_MS: 5000,
          BACKEND_MODEL_MAX_ATTEMPTS: 1,
          BACKEND_MODEL_MAX_STEPS: 8,
          BACKEND_MODEL_MAX_OUTPUT_TOKENS: 2000,
        });

        // Capacity is a separate tested boundary; isolate this low-volume evaluation
        // from the production Redis limiter while calling the real decision API.
        const capacity = {
          reserve: () => Promise.resolve(() => Promise.resolve()),
        } as unknown as DecisionCapacityService;

        const decisions = new TurnDecisionService(
          new TypeSafeDecisionGateway(
            config,
            capacity,
            ObservabilityService.disabled(),
          ),
          new DecisionSettings(config),
        );

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
                  id: 'request',
                  role: 'user',
                  content: 'Kirim foto ktp saya',
                  createdAt: new Date(0),
                },
              ],
            }),
          findRecentContexts: () => Promise.resolve([]),
        } as unknown as IConversationRepository;

        const documents = {
          listMetadata: () => Promise.resolve([saved]),
          findMetadataByMessageId: () => Promise.resolve([]),
        } as unknown as IDocumentRepository;

        const builder = new ContextBuilderService(
          conversations,
          config,
          documents,
          undefined,
          undefined,
          undefined,
          decisions,
        );

        const built = await builder.build(
          user,
          'synthetic-chat',
          'request',
          channel,
        );

        expect(built.decision?.toolNames).toContain('send_file');
        const attachment: AssistantFile = {
          filename: saved.title,
          mimeType: saved.file.mimeType,
          buffer: Buffer.from('synthetic fixture'),
        };

        const sendFile = jest
          .fn<(file: AssistantFile) => Promise<{ providerMessageId: string }>>()
          .mockResolvedValue({ providerMessageId: 'synthetic-delivery' });

        type Dependencies = Parameters<typeof createPhaseTools>[0];
        const phaseTools = createPhaseTools({
          contacts: {} as Dependencies['contacts'],
          contactGroups: {} as Dependencies['contactGroups'],
          calendars: {} as Dependencies['calendars'],
          calendarService: {} as Dependencies['calendarService'],
          calendarRead: {} as Dependencies['calendarRead'],
          calendarSync: {} as Dependencies['calendarSync'],
          users: {} as Dependencies['users'],
          documents: {
            listMetadata: () => Promise.resolve([saved]),
            loadFile: () => Promise.resolve(attachment),
            searchForMessage: () => Promise.resolve([]),
          } as unknown as Dependencies['documents'],
        });

        const tools = Object.fromEntries(
          phaseTools
            .filter(({ definition }) =>
              built.decision?.toolNames?.includes(definition.name),
            )
            .map((domain) => [
              domain.definition.name,
              tool({
                description: domain.definition.description,
                inputSchema: jsonSchema(
                  terminalToolInputSchema(domain.definition),
                ),
                execute: async (raw, { toolCallId }) => {
                  const args = { ...(raw as Record<string, unknown>) };
                  delete args.completeTurn;

                  return JSON.stringify(
                    await domain.execute({
                      userId: user.id,
                      sourceMessageId: 'request',
                      idempotencyKey: toolCallId,
                      arguments: domain.parseArguments(args),
                      context: { channel, sendFile },
                    }),
                  );
                },
              }),
            ]),
        );

        try {
          await new OpenRouterLanguageModel(
            config,
            ObservabilityService.disabled(),
          ).generate({
            messages: built.messages,
            tools,
            acknowledgeTerminalStep: (executions, decidedBy) =>
              buildTerminalToolResponse(
                { locale: 'id', timezone: user.timezone, channel },
                executions,
                decidedBy,
              ),
          });
          expect(sendFile).toHaveBeenCalledTimes(1);
          expect(sendFile).toHaveBeenCalledWith(attachment);
        } finally {
          await decisions.onModuleDestroy();
        }
      },
      180_000,
    );
  },
);
