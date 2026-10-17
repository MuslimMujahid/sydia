import { Module } from '@nestjs/common';
import { WORKSPACE_REPOSITORY } from '../../database/interfaces';
import { PrismaWorkspaceRepository } from '../../database/repositories';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { EmbeddingsModule } from '../../infra/embeddings';
import { DailyNotesModule } from '../daily-notes/daily-notes.module';

@Module({
  imports: [EmbeddingsModule, DailyNotesModule],
  controllers: [NotesController],
  providers: [
    { provide: WORKSPACE_REPOSITORY, useClass: PrismaWorkspaceRepository },
    NotesService,
  ],
  exports: [NotesService],
})
export class NotesModule {}
