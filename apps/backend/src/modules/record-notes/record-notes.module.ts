import { Module } from '@nestjs/common';
import {
  RECORD_NOTES_REPOSITORY,
  WORKSPACE_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaRecordNotesRepository,
  PrismaWorkspaceRepository,
} from '../../database/repositories';
import { RecordNotesService } from './record-notes.service';
import { RecordNotesController } from './record-notes.controller';

@Module({
  controllers: [RecordNotesController],
  providers: [
    RecordNotesService,
    { provide: RECORD_NOTES_REPOSITORY, useClass: PrismaRecordNotesRepository },
    { provide: WORKSPACE_REPOSITORY, useClass: PrismaWorkspaceRepository },
  ],
  exports: [RecordNotesService],
})
export class RecordNotesModule {}
