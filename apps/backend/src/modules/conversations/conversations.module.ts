import { Module } from '@nestjs/common';
import { ModelGatewayModule } from '../../infra/model-gateway';
import {
  CONVERSATION_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaConversationRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { ConversationsController } from './conversations.controller';
import {
  ASSISTANT_TOOLS,
  AssistantOrchestratorService,
  ContextBuilderService,
  ConversationSummarizerService,
  ToolExecutorService,
} from './services';

@Module({
  imports: [ModelGatewayModule],
  controllers: [ConversationsController],
  providers: [
    {
      provide: CONVERSATION_REPOSITORY,
      useClass: PrismaConversationRepository,
    },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: ASSISTANT_TOOLS, useValue: [] },
    AssistantOrchestratorService,
    ContextBuilderService,
    ConversationSummarizerService,
    ToolExecutorService,
  ],
})
export class ConversationsModule {}
