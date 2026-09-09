import { Module } from '@nestjs/common';
import { ModelGatewayModule } from '../../infra/model-gateway';
import { MemoriesModule } from '../memories/memories.module';
import { RemindersModule } from '../reminders/reminders.module';
import { TasksModule } from '../tasks/tasks.module';
import { DocumentsModule } from '../documents/documents.module';
import { ContactsModule } from '../contacts/contacts.module';
import { CalendarModule } from '../calendar/calendar.module';
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
  DomainToolsProvider,
} from './services';

@Module({
  imports: [
    ModelGatewayModule,
    TasksModule,
    RemindersModule,
    MemoriesModule,
    DocumentsModule,
    ContactsModule,
    CalendarModule,
  ],
  controllers: [ConversationsController],
  providers: [
    {
      provide: CONVERSATION_REPOSITORY,
      useClass: PrismaConversationRepository,
    },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    DomainToolsProvider,
    {
      provide: ASSISTANT_TOOLS,
      useFactory: (provider: DomainToolsProvider) => provider.tools,
      inject: [DomainToolsProvider],
    },
    AssistantOrchestratorService,
    ContextBuilderService,
    ConversationSummarizerService,
    ToolExecutorService,
  ],
  exports: [
    AssistantOrchestratorService,
    CONVERSATION_REPOSITORY,
    ToolExecutorService,
    USER_REPOSITORY,
  ],
})
export class ConversationsModule {}
