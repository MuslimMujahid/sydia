import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  CONVERSATION_REPOSITORY,
  ConversationNotFoundError,
  USER_REPOSITORY,
  type IConversationRepository,
  type IUserRepository,
} from '../../database/interfaces';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { SendMessageDto } from './dto';
import { AssistantOrchestratorService } from './services';

@Controller('conversations')
export class ConversationsController {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: IConversationRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    private readonly orchestrator: AssistantOrchestratorService,
  ) {}

  @Get()
  list(@Session() session: UserSession) {
    return this.conversations.list(session.user.id);
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

  private notFound(): ApiException {
    return new ApiException({
      code: ErrorCodes.NOT_FOUND,
      message: 'Percakapan tidak ditemukan.',
      status: HttpStatus.NOT_FOUND,
    });
  }
}
