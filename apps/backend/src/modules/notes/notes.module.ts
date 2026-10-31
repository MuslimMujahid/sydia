import { NoteClarificationService } from './note-clarification.service';
import { ModelGatewayModule } from '../../infra/model-gateway';
import { NoteOrganizationService } from './note-organization.service';
import { NoteOrganizationSchedulerService } from './note-organization-scheduler.service';
import { NoteMutationService } from './note-mutation.service';
import { Module } from '@nestjs/common';
import {
  WORKSPACE_REPOSITORY,
  NOTE_PRESENCE_REPOSITORY,
  NOTE_WORK_REPOSITORY,
  NOTE_AGENT_RUN_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaWorkspaceRepository,
  PrismaNotePresenceRepository,
  PrismaNoteWorkRepository,
  PrismaNoteAgentRunRepository,
} from '../../database/repositories';
import { NotePresenceController } from './note-presence.controller';
import { NotePresenceService } from './note-presence.service';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { EmbeddingsModule } from '../../infra/embeddings';
import { DailyNotesModule } from '../daily-notes/daily-notes.module';

@Module({
  imports: [EmbeddingsModule, DailyNotesModule, ModelGatewayModule],
  controllers: [NotesController, NotePresenceController],
  providers: [
    { provide: WORKSPACE_REPOSITORY, useClass: PrismaWorkspaceRepository },
    NotesService,
    {
      provide: NOTE_PRESENCE_REPOSITORY,
      useClass: PrismaNotePresenceRepository,
    },
    NotePresenceService,
    NoteMutationService,
    NoteOrganizationService,
    NoteClarificationService,
    NoteOrganizationSchedulerService,
    { provide: NOTE_WORK_REPOSITORY, useClass: PrismaNoteWorkRepository },
    {
      provide: NOTE_AGENT_RUN_REPOSITORY,
      useClass: PrismaNoteAgentRunRepository,
    },
  ],
  exports: [
    NotesService,
    NotePresenceService,
    NoteMutationService,
    NoteOrganizationService,
    NoteClarificationService,
    NoteOrganizationSchedulerService,
    NOTE_PRESENCE_REPOSITORY,
    NOTE_WORK_REPOSITORY,
    NOTE_AGENT_RUN_REPOSITORY,
  ],
})
export class NotesModule {}
