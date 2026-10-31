import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Logger,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import {
  NOTE_WORK_REPOSITORY,
  type INoteWorkRepository,
} from '../../database/interfaces';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { NoteAgentCoordinatorService } from './services/note-agent-coordinator.service';

export class ReviewNoteOrganizationDto {
  @IsIn(['proposal', 'apply'])
  mode!: 'proposal' | 'apply';

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,128}$/)
  sourceWorkId?: string;
}

/** Operational review surface; never available outside development. */
@Roles(['user'])
@Controller('notes/organization')
export class NoteOrganizationController {
  private readonly logger = new Logger(NoteOrganizationController.name);
  constructor(
    private readonly config: ConfigService,
    private readonly organization: NoteAgentCoordinatorService,
    @Inject(NOTE_WORK_REPOSITORY) private readonly work: INoteWorkRepository,
  ) {}

  private requireDevelopment() {
    if (this.config.get<string>('NODE_ENV') === 'development') return;
    this.logger.warn('Rejected note organization review outside development.');
    throw new ApiException({
      code: ErrorCodes.NOT_FOUND,
      status: HttpStatus.NOT_FOUND,
      message: 'Halaman tidak ditemukan.',
    });
  }

  @Get('work')
  history(@Session() session: UserSession) {
    this.requireDevelopment();

    return this.work.history(session.user.id);
  }

  @Post('review')
  review(
    @Session() session: UserSession,
    @Body() input: ReviewNoteOrganizationDto,
  ) {
    this.requireDevelopment();

    return this.organization.review(
      session.user.id,
      input.mode,
      input.sourceWorkId,
    );
  }
}
