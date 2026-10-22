import { AllowInactiveBilling } from '../billing';
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
import { NotesService } from './notes.service';
import {
  CreateWorkspaceItemDto,
  UpdateWorkspaceItemDto,
  WorkspaceRevisionDto,
  WorkspaceSearchDto,
} from './notes.dto';

@Roles(['user'])
@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}
  @Get() list(@Session() session: UserSession) {
    return this.notes.list(session.user.id);
  }

  @Get('search') search(
    @Session() session: UserSession,
    @Query() query: WorkspaceSearchDto,
  ) {
    return this.notes.search(session.user.id, query.query, query);
  }

  @Get('backlinks') backlinks(
    @Session() session: UserSession,
    @Query('target') target: string,
  ) {
    return this.notes.backlinks(session.user.id, target);
  }

  @Get('items/:id') find(
    @Session() session: UserSession,
    @Param('id') id: string,
  ) {
    return this.notes.find(session.user.id, id);
  }

  @Post('items') create(
    @Session() session: UserSession,
    @Body() input: CreateWorkspaceItemDto,
  ) {
    return this.notes.create(session.user.id, input);
  }

  @Patch('items/:id') update(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() input: UpdateWorkspaceItemDto,
  ) {
    return this.notes.update(session.user.id, id, input);
  }

  @AllowInactiveBilling()
  @Post('items/:id/trash')
  trash(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() input: WorkspaceRevisionDto,
  ) {
    return this.notes.execute(session.user.id, {
      action: 'trash',
      id,
      revision: input.revision,
    });
  }

  @Post('items/:id/restore') restore(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() input: WorkspaceRevisionDto,
  ) {
    return this.notes.execute(session.user.id, {
      action: 'restore',
      id,
      ...input,
    });
  }

  @AllowInactiveBilling()
  @Post('items/:id/delete')
  remove(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() input: WorkspaceRevisionDto,
  ) {
    return this.notes.execute(session.user.id, {
      action: 'delete',
      id,
      revision: input.revision,
    });
  }
}
