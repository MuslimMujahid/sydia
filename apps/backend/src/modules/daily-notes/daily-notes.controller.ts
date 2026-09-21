import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../database/interfaces';
import { DAY_KEY_PATTERN } from '../../database/entities';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { parseRichTextDocument } from '../../shared/rich-text';
import { DailyNoteService } from './daily-note.service';
import { DailyNoteRangeDto, SaveDailyNoteDto } from './daily-note.dto';

@Roles(['user'])
@Controller('daily-notes')
export class DailyNotesController {
  constructor(
    private readonly notes: DailyNoteService,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly audit: IAuditEventRepository,
  ) {}

  @Get() list(@Session() s: UserSession, @Query() q: DailyNoteRangeDto) {
    return this.notes.list(s.user.id, { from: q.from, to: q.to });
  }

  @Get(':date') async get(
    @Session() s: UserSession,
    @Param('date') date: string,
  ) {
    // A day with no note is a normal, empty state — not a failure. The note is
    // nested in an object because the response interceptor passes a bare null
    // through unwrapped, which would send the client a body it cannot read.
    return {
      note: await this.notes.findByDate(s.user.id, this.validDate(date)),
    };
  }

  @Put(':date') async save(
    @Session() s: UserSession,
    @Param('date') date: string,
    @Body() input: SaveDailyNoteDto,
  ) {
    const day = this.validDate(date);
    const document = parseRichTextDocument(input.content);

    if (!document) throw this.invalidDocument();

    // An empty document clears the day. The response says so explicitly so the
    // client does not have to infer a deletion from a missing note.
    const note = await this.notes.save(s.user.id, {
      date: day,
      document,
      sourceType: 'dashboard',
    });

    await this.audit.record({
      userId: s.user.id,
      eventType: note ? 'daily_note.saved' : 'daily_note.cleared',
      metadata: { date: day, ...(note ? { noteId: note.id } : {}) },
    });

    return { note, cleared: note === null };
  }

  @Delete(':date') @HttpCode(HttpStatus.NO_CONTENT) async remove(
    @Session() s: UserSession,
    @Param('date') date: string,
  ) {
    const day = this.validDate(date);

    if (!(await this.notes.remove(s.user.id, day))) throw this.notFound();

    await this.audit.record({
      userId: s.user.id,
      eventType: 'daily_note.deleted',
      metadata: { date: day },
    });
  }

  private validDate(date: string): string {
    if (!DAY_KEY_PATTERN.test(date)) throw this.invalidDate();

    return date;
  }

  private invalidDate() {
    return new ApiException({
      code: ErrorCodes.BAD_REQUEST,
      message: 'Tanggal catatan tidak valid.',
      status: HttpStatus.BAD_REQUEST,
    });
  }

  private invalidDocument() {
    return new ApiException({
      code: ErrorCodes.BAD_REQUEST,
      message: 'Isi catatan tidak valid.',
      status: HttpStatus.BAD_REQUEST,
    });
  }

  private notFound() {
    return new ApiException({
      code: ErrorCodes.NOT_FOUND,
      message: 'Catatan tidak ditemukan.',
      status: HttpStatus.NOT_FOUND,
    });
  }
}
