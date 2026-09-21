import { Module } from '@nestjs/common';
import {
  DAILY_NOTE_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaDailyNoteRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { EmbeddingsModule } from '../../infra/embeddings';
import { DailyNotesController } from './daily-notes.controller';
import { DailyNoteService } from './daily-note.service';

@Module({
  imports: [EmbeddingsModule],
  controllers: [DailyNotesController],
  providers: [
    { provide: DAILY_NOTE_REPOSITORY, useClass: PrismaDailyNoteRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    DailyNoteService,
  ],
  exports: [DAILY_NOTE_REPOSITORY, DailyNoteService],
})
export class DailyNotesModule {}
