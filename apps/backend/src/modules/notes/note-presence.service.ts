import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  NOTE_PRESENCE_REPOSITORY,
  type INotePresenceRepository,
} from '../../database/interfaces';
import { isDayKey } from '../../database/entities';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { DailyNoteService } from '../daily-notes/daily-note.service';
import { NotesService } from './notes.service';

@Injectable()
export class NotePresenceService {
  constructor(
    @Inject(NOTE_PRESENCE_REPOSITORY)
    private readonly presence: INotePresenceRepository,
    private readonly notes: NotesService,
    private readonly daily: DailyNoteService,
  ) {}

  async acquire(userId: string, ref: string, sessionId: string) {
    if (ref.startsWith('daily:') && isDayKey(ref.slice(6))) {
      await this.daily.findByDate(userId, ref.slice(6));
    } else if (/^custom:[a-zA-Z0-9_-]+$/.test(ref)) {
      const note = await this.notes.find(userId, ref.slice(7));
      if (note.kind !== 'note') throw this.invalidReference();
    } else {
      throw this.invalidReference();
    }

    return this.presence.acquire(userId, ref, sessionId);
  }

  async release(userId: string, ref: string, sessionId: string) {
    await this.presence.release(userId, ref, sessionId);

    return { released: true };
  }

  private invalidReference() {
    return new ApiException({
      code: ErrorCodes.BAD_REQUEST,
      status: HttpStatus.BAD_REQUEST,
      message: 'Referensi catatan tidak valid.',
    });
  }
}
