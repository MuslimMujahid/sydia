import { Injectable } from '@nestjs/common';
import type { User } from '../../database/entities';
import type { NormalizedInboundMessage } from '../../shared/messaging';
import { AssistantOrchestratorService } from '../conversations/services/assistant-orchestrator.service';

export type InboundMessageInput = {
  message: NormalizedInboundMessage;
  user: User;
  content: string;
  attachmentIds?: string[];
  transformResponse?: (content: string) => string;
  send: (content: string) => Promise<void>;
};

@Injectable()
export class MessagingHandlerService {
  constructor(private readonly assistant: AssistantOrchestratorService) {}

  async handle(input: InboundMessageInput): Promise<boolean> {
    const turn = await this.assistant.sendAndWait(input.user, {
      content: input.content,
      idempotencyKey: `${input.message.provider}:${input.message.providerMessageId}`,
      attachmentIds: input.attachmentIds,
    });

    if (!turn.assistantMessage) return false;
    const content = input.transformResponse
      ? input.transformResponse(turn.assistantMessage.content)
      : turn.assistantMessage.content;

    await input.send(content);

    return true;
  }
}
