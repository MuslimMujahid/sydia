import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '../../../database/entities';
import {
  CHAT_PREVIEW_REPOSITORY,
  USER_REPOSITORY,
  type IChatPreviewRepository,
  type IUserRepository,
} from '../../../database/interfaces';
import { ApiException, ErrorCodes } from '../../../shared/errors';
import type { ChatPreviewScopeDto } from '../dto/conversation.dto';

export function previewUserId(
  ownerId: string,
  sessionId: string,
  channel: string,
): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([ownerId, sessionId, channel]))
    .digest('hex');

  return `chat-preview-${digest}`;
}

@Injectable()
export class ChatPreviewService {
  private readonly logger = new Logger(ChatPreviewService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(CHAT_PREVIEW_REPOSITORY)
    private readonly previews: IChatPreviewRepository,
  ) {}

  async resolve(
    owner: User,
    scope: ChatPreviewScopeDto,
    create = false,
  ): Promise<User> {
    if (
      scope.previewSessionId === undefined &&
      scope.previewChannel === undefined
    )
      return owner;

    if (this.config.get<string>('NODE_ENV') !== 'development') {
      this.logger.warn('Rejected chat preview options outside development');
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Chat previews are available only in development.',
        status: HttpStatus.NOT_FOUND,
      });
    }

    if (!scope.previewSessionId || !scope.previewChannel) {
      throw new ApiException({
        code: ErrorCodes.BAD_REQUEST,
        message: 'Both previewSessionId and previewChannel are required.',
        status: HttpStatus.BAD_REQUEST,
      });
    }

    const id = previewUserId(
      owner.id,
      scope.previewSessionId,
      scope.previewChannel,
    );

    if (create) await this.previews.createSandboxes([id], owner);
    const sandbox = await this.users.findById(id);
    if (!sandbox)
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Preview session not found. Send a message to start it.',
        status: HttpStatus.NOT_FOUND,
      });

    return sandbox;
  }
}
