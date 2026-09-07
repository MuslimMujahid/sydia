import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  CONVERSATION_REPOSITORY,
  ConversationNotFoundError,
  USER_REPOSITORY,
  type IConversationRepository,
  type IUserRepository,
} from '../../database/interfaces';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { IsBoolean } from 'class-validator';
import { SendMessageDto } from './dto';
import { AssistantOrchestratorService, ToolExecutorService } from './services';

class ResolveConfirmationDto {
  @IsBoolean() approved!: boolean;
}

@Roles(['user'])
@Controller('conversations')
export class ConversationsController {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly orchestrator: AssistantOrchestratorService,
    private readonly toolExecutor: ToolExecutorService,
  ) {}

  @Get()
  list(@Session() session: UserSession) {
    return this.conversations.list(session.user.id);
  }

  @Delete(':conversationId')
  async delete(
    @Session() session: UserSession,
    @Param('conversationId') conversationId: string,
  ) {
    const deleted = await this.conversations.delete(
      session.user.id,
      conversationId,
    );

    if (!deleted) throw this.notFound();

    return { deleted: true };
  }

  @Get(':conversationId')
  async detail(
    @Session() session: UserSession,
    @Param('conversationId') conversationId: string,
  ) {
    const detail = await this.conversations.findDetail(
      session.user.id,
      conversationId,
    );

    if (!detail) throw this.notFound();

    return detail;
  }

  @Post('messages')
  async send(@Session() session: UserSession, @Body() input: SendMessageDto) {
    const user = await this.users.findById(session.user.id);
    if (!user) throw this.notFound();

    try {
      return await this.orchestrator.send(user, input);
    } catch (error) {
      if (error instanceof ConversationNotFoundError) throw this.notFound();
      throw error;
    }
  }

  @Post(':conversationId/runs/:runId/retry')
  async retry(
    @Session() session: UserSession,
    @Param('conversationId') conversationId: string,
    @Param('runId') runId: string,
  ) {
    const user = await this.users.findById(session.user.id);
    if (!user) throw this.notFound();

    const result = await this.orchestrator.retry(user, conversationId, runId);
    if (!result) throw this.notFound();

    return result;
  }

  @Post('tool-invocations/:invocationId/confirmation')
  async resolveConfirmation(
    @Session() session: UserSession,
    @Param('invocationId') invocationId: string,
    @Body() input: ResolveConfirmationDto,
  ) {
    const result = await this.toolExecutor.resolveConfirmation(
      session.user.id,
      invocationId,
      input.approved,
    );

    if (!result) throw this.notFound();

    return result.invocation;
  }

  private notFound(): ApiException {
    return new ApiException({
      code: ErrorCodes.NOT_FOUND,
      message: 'Percakapan tidak ditemukan.',
      status: HttpStatus.NOT_FOUND,
    });
  }
}
