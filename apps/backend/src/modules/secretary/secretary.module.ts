import { Module } from '@nestjs/common';
import {
  ASSISTANT_ACTION_REPOSITORY,
  CONVERSATION_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaAssistantActionRepository,
  PrismaConversationRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { CalendarModule } from '../calendar/calendar.module';
import { DailyNotesModule } from '../daily-notes/daily-notes.module';
import { MemoriesModule } from '../memories/memories.module';
import { NotesModule } from '../notes/notes.module';
import { RemindersModule } from '../reminders/reminders.module';
import { TasksModule } from '../tasks/tasks.module';
import { AssistancePolicyService } from './assistance-policy.service';
import { AssistantActionService } from './assistant-action.service';
import { AvailabilityService } from './availability.service';
import { SECRETARY_CLOCK, systemSecretaryClock } from './secretary-clock';
import { SkillCatalogService } from './skill-catalog.service';
import { WorkContextService } from './work-context.service';

@Module({
  imports: [
    CalendarModule,
    DailyNotesModule,
    MemoriesModule,
    NotesModule,
    RemindersModule,
    TasksModule,
  ],
  providers: [
    {
      provide: ASSISTANT_ACTION_REPOSITORY,
      useClass: PrismaAssistantActionRepository,
    },
    {
      provide: CONVERSATION_REPOSITORY,
      useClass: PrismaConversationRepository,
    },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: SECRETARY_CLOCK, useValue: systemSecretaryClock },
    SkillCatalogService,
    WorkContextService,
    AvailabilityService,
    AssistancePolicyService,
    AssistantActionService,
  ],
  exports: [
    ASSISTANT_ACTION_REPOSITORY,
    SECRETARY_CLOCK,
    SkillCatalogService,
    WorkContextService,
    AvailabilityService,
    AssistancePolicyService,
    AssistantActionService,
  ],
})
export class SecretaryModule {}
