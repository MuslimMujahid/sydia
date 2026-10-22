import { AllowInactiveBilling } from '../billing';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { Inject } from '@nestjs/common';
import {
  FILE_DELETION_REPOSITORY,
  type IFileDeletionRepository,
} from '../../database/interfaces';
import { PaginatedResult } from '../../shared/response/paginated-result';
import {
  FileLibraryQueryDto,
  FileLibrarySelectionDto,
  RetryFileDeletionDto,
  StartFileDeletionDto,
} from './file-library.dto';
import { FileLibraryService } from './file-library.service';

@Roles(['user'])
@AllowInactiveBilling()
@Controller('file-library')
export class FileDeletionController {
  constructor(
    @Inject(FILE_DELETION_REPOSITORY)
    private readonly deletions: IFileDeletionRepository,
    private readonly library: FileLibraryService,
  ) {}

  @Post('delete-previews')
  preview(
    @Session() session: UserSession,
    @Body() body: FileLibrarySelectionDto,
  ) {
    return this.library.execute(() =>
      this.deletions.preview(session.user.id, body.items, new Date()),
    );
  }

  @Post('deletions')
  @HttpCode(202)
  start(@Session() session: UserSession, @Body() body: StartFileDeletionDto) {
    return this.library.execute(() =>
      this.deletions.start(
        session.user.id,
        body.previewId,
        body.idempotencyKey,
        new Date(),
      ),
    );
  }

  @Get('deletions')
  list(@Session() session: UserSession, @Query() query: FileLibraryQueryDto) {
    return this.library.execute(async () => {
      const result = await this.deletions.list(
        session.user.id,
        query.offset,
        query.limit,
      );

      return new PaginatedResult(result.items, {
        total: result.total,
        offset: query.offset,
        limit: query.limit,
      });
    });
  }

  @Get('deletions/:id')
  detail(@Session() session: UserSession, @Param('id') id: string) {
    return this.library.execute(() =>
      this.deletions.detail(session.user.id, id),
    );
  }

  @Get('deletions/:id/failures')
  failures(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Query() query: FileLibraryQueryDto,
  ) {
    return this.library.execute(async () => {
      const result = await this.deletions.failures(
        session.user.id,
        id,
        query.offset,
        query.limit,
      );

      return new PaginatedResult(result.items, {
        total: result.total,
        offset: query.offset,
        limit: query.limit,
      });
    });
  }

  @Post('deletions/:id/retry-preview')
  retryPreview(@Session() session: UserSession, @Param('id') id: string) {
    return this.library.execute(() =>
      this.deletions.retryPreview(session.user.id, id, new Date()),
    );
  }

  @Post('deletions/:id/retry')
  @HttpCode(202)
  retry(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() body: RetryFileDeletionDto,
  ) {
    return this.library.execute(() =>
      this.deletions.retry(session.user.id, id, body.previewId, new Date()),
    );
  }
}
