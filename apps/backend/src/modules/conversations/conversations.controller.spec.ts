import { jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { SendMessageDto } from './dto';
import type { Response } from 'express';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type {
  IConversationRepository,
  IUserRepository,
} from '../../database/interfaces';
import { ConversationsController } from './conversations.controller';
import type { AssistantOrchestratorService } from './services';
import type { ChatPreviewService } from './services/chat-preview.service';

describe('chat source preview isolation', () => {
  test.each(['queued', 'streaming'])(
    '%s sends reject real source references before resolving account data',
    async (mode) => {
      const findById = jest.fn();
      const resolve = jest.fn();
      const sendQueued = jest.fn();
      const stream = jest.fn();
      const controller = new ConversationsController(
        {} as IConversationRepository,
        { findById } as unknown as IUserRepository,
        { sendQueued, stream } as unknown as AssistantOrchestratorService,
        { resolve } as unknown as ChatPreviewService,
      );

      const session = { user: { id: 'owner' } } as UserSession;
      const input = plainToInstance(SendMessageDto, {
        content: 'Use my note',
        idempotencyKey: 'send',
        previewSessionId: 'preview',
        previewChannel: 'web' as const,
        sourceSegments: [
          {
            type: 'source' as const,
            source: {
              kind: 'note' as const,
              id: 'custom:private',
              label: 'Private',
            },
          },
        ],
      });

      const request =
        mode === 'queued'
          ? controller.send(session, input)
          : controller.stream(session, input, {} as Response);

      await expect(request).rejects.toMatchObject({ status: 400 });
      expect(findById).not.toHaveBeenCalled();
      expect(resolve).not.toHaveBeenCalled();
      expect(sendQueued).not.toHaveBeenCalled();
      expect(stream).not.toHaveBeenCalled();
    },
  );
});
