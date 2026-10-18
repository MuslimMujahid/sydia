import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { pipeUIMessageStreamToResponse } from 'ai';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  CONVERSATION_REPOSITORY,
  ConversationNotFoundError,
  USER_REPOSITORY,
  type IConversationRepository,
  type IUserRepository,
} from '../../database/interfaces';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { SendMessageDto } from './dto';
import { ChatPreviewScopeDto } from './dto/conversation.dto';
import { ChatPreviewService } from './services/chat-preview.service';
import { AssistantOrchestratorService } from './services';

@Roles(['user'])
@Controller('conversations')
export class ConversationsController {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly orchestrator: AssistantOrchestratorService,
    private readonly previews: ChatPreviewService,
  ) {}

  @Get()
  list(@Session() session: UserSession) {
    return this.conversations.list(session.user.id);
  }

  @Delete(':conversationId')
  async delete(
    @Session() session: UserSession,
    @Param('conversationId') conversationId: string,
    @Query() scope: ChatPreviewScopeDto,
  ) {
    const user = await this.resolveUser(session, scope);
    const deleted = await this.conversations.delete(user.id, conversationId);

    if (!deleted) throw this.notFound();

    return { deleted: true };
  }

  @Get(':conversationId')
  async detail(
    @Session() session: UserSession,
    @Param('conversationId') conversationId: string,
    @Query() scope: ChatPreviewScopeDto,
  ) {
    const user = await this.resolveUser(session, scope);
    const detail = await this.conversations.findDetail(user.id, conversationId);

    if (!detail) throw this.notFound();

    return detail;
  }

  @Post('messages')
  async send(@Session() session: UserSession, @Body() input: SendMessageDto) {
    const user = await this.resolveUser(session, input, true);

    try {
      return await this.orchestrator.sendQueued(
        user,
        input,
        this.previewContext(input),
      );
    } catch (error) {
      if (error instanceof ConversationNotFoundError) throw this.notFound();
      throw error;
    }
  }

  @Post('messages/stream')
  async stream(
    @Session() session: UserSession,
    @Body() input: SendMessageDto,
    @Res() response: Response,
  ): Promise<void> {
    const user = await this.resolveUser(session, input, true);

    await pipeUIMessageStreamToResponse({
      response,
      stream: this.orchestrator.stream(user, input, this.previewContext(input)),
    });
  }

  @Post(':conversationId/runs/:runId/retry')
  async retry(
    @Session() session: UserSession,
    @Param('conversationId') conversationId: string,
    @Param('runId') runId: string,
    @Query() scope: ChatPreviewScopeDto,
  ) {
    const user = await this.resolveUser(session, scope);

    const result = await this.orchestrator.retry(
      user,
      conversationId,
      runId,
      this.previewContext(scope),
    );

    if (!result) throw this.notFound();

    return result;
  }

  private async resolveUser(
    session: UserSession,
    scope: ChatPreviewScopeDto,
    create = false,
  ) {
    if (
      scope.previewSessionId &&
      'activeNoteRef' in scope &&
      scope.activeNoteRef
    ) {
      throw new ApiException({
        code: ErrorCodes.BAD_REQUEST,
        status: HttpStatus.BAD_REQUEST,
        message: 'Catatan aktif tidak tersedia dalam pratinjau chat.',
      });
    }

    const owner = await this.users.findById(session.user.id);
    if (!owner) throw this.notFound();

    return this.previews.resolve(owner, scope, create);
  }

  private previewContext(scope: ChatPreviewScopeDto) {
    if (!scope.previewSessionId) return undefined;

    return {
      channel:
        scope.previewChannel === 'web' ? undefined : scope.previewChannel,
      captureFiles: true,
    };
  }

  private notFound(): ApiException {
    return new ApiException({
      code: ErrorCodes.NOT_FOUND,
      message: 'Percakapan tidak ditemukan.',
      status: HttpStatus.NOT_FOUND,
    });
  }
}
