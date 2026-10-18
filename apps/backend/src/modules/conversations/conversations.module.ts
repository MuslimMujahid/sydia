import { Module } from '@nestjs/common';
import { ModelGatewayModule } from '../../infra/model-gateway';
import { DecisionGatewayModule } from '../../infra/decision-gateway';
import { TurnDecisionService } from './services/turn-decision.service';
import { MemoriesModule } from '../memories/memories.module';
import { DailyNotesModule } from '../daily-notes/daily-notes.module';
import { NotesModule } from '../notes/notes.module';
import { RemindersModule } from '../reminders/reminders.module';
import { TasksModule } from '../tasks/tasks.module';
import { DocumentsModule } from '../documents/documents.module';
import { ContactsModule } from '../contacts/contacts.module';
import { CalendarModule } from '../calendar/calendar.module';
import { SecretsModule } from '../secrets/secrets.module';
import {
  CHAT_PREVIEW_REPOSITORY,
  CONVERSATION_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaChatPreviewRepository,
  PrismaConversationRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { ChatPreviewService } from './services/chat-preview.service';
import { ActiveNoteService } from './services/active-note.service';
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
    DecisionGatewayModule,
    TasksModule,
    RemindersModule,
    MemoriesModule,
    DailyNotesModule,
    NotesModule,
    DocumentsModule,
    ContactsModule,
    CalendarModule,
    SecretsModule,
  ],
  controllers: [ConversationsController],
  providers: [
    ChatPreviewService,
    ActiveNoteService,
    { provide: CHAT_PREVIEW_REPOSITORY, useClass: PrismaChatPreviewRepository },
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
    TurnDecisionService,
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
