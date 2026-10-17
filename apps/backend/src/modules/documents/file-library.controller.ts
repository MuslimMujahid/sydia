import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { PaginatedResult } from '../../shared/response/paginated-result';
import {
  CreateFileFolderDto,
  FileLibraryQueryDto,
  MoveFileLibraryDto,
  RenameFileFolderDto,
} from './file-library.dto';
import { FileLibraryService } from './file-library.service';

@Roles(['user'])
@Controller('file-library')
export class FileLibraryController {
  constructor(private readonly service: FileLibraryService) {}

  @Get('items')
  list(@Session() session: UserSession, @Query() query: FileLibraryQueryDto) {
    return this.service.execute(async () => {
      const result = await this.service.repository.list(session.user.id, {
        folderId: query.folderId ?? null,
        offset: query.offset,
        limit: query.limit,
        sort: query.sort,
        direction: query.direction,
        foldersOnly: query.foldersOnly === 'true',
      });

      return new PaginatedResult(result.items, {
        offset: query.offset,
        limit: query.limit,
        total: result.total,
      });
    });
  }

  @Get('search')
  search(@Session() session: UserSession, @Query() query: FileLibraryQueryDto) {
    return this.service.execute(async () => {
      const result = await this.service.repository.list(session.user.id, {
        folderId: null,
        query: query.q?.trim() ?? '',
        offset: query.offset,
        limit: query.limit,
        sort: query.sort,
        direction: query.direction,
      });

      return new PaginatedResult(result.items, {
        offset: query.offset,
        limit: query.limit,
        total: result.total,
      });
    });
  }

  @Get('folders/:id')
  folder(@Session() session: UserSession, @Param('id') id: string) {
    return this.service.execute(() =>
      this.service.repository.folder(session.user.id, id),
    );
  }

  @Post('folders')
  create(@Session() session: UserSession, @Body() body: CreateFileFolderDto) {
    return this.service.execute(() =>
      this.service.repository.createFolder(
        session.user.id,
        body.name,
        body.parentId ?? null,
      ),
    );
  }

  @Patch('folders/:id')
  rename(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() body: RenameFileFolderDto,
  ) {
    return this.service.execute(() =>
      this.service.repository.renameFolder(
        session.user.id,
        id,
        body.name,
        body.revision,
      ),
    );
  }

  @Post('moves')
  move(@Session() session: UserSession, @Body() body: MoveFileLibraryDto) {
    return this.service.execute(async () => {
      await this.service.repository.move(
        session.user.id,
        body.items,
        body.destinationId ?? null,
      );

      return { moved: true };
    });
  }
}
