import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { NotesService } from '../../notes/notes.service';
import { DailyNoteService } from '../../daily-notes/daily-note.service';
import { ApiException, ErrorCodes } from '../../../shared/errors';
import { isDayKey } from '../../../database/entities';

@Injectable()
export class ActiveNoteService {
  private readonly logger = new Logger(ActiveNoteService.name);
  constructor(
    private readonly notes: NotesService,
    private readonly daily: DailyNoteService,
  ) {}

  async validate(userId: string, ref: string): Promise<void> {
    try {
      if (/^custom:[a-zA-Z0-9_-]+$/.test(ref)) {
        await this.notes.find(userId, ref.slice(7));

        return;
      }

      if (ref.startsWith('daily:') && isDayKey(ref.slice(6))) {
        // An empty date is a valid editor destination. The read is owner scoped.
        await this.daily.findByDate(userId, ref.slice(6));

        return;
      }

      throw new ApiException({
        code: ErrorCodes.BAD_REQUEST,
        status: HttpStatus.BAD_REQUEST,
        message: 'Referensi catatan tidak valid.',
      });
    } catch (error) {
      this.logger.warn(
        `Active note validation failed ref=${ref}`,
        error instanceof Error ? error.name : 'UnknownError',
      );
      throw error;
    }
  }
}
