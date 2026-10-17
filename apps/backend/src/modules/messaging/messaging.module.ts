import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { MessagingHandlerService } from './messaging-handler.service';
import { NOTIFICATION_REPOSITORY } from '../../database/interfaces';
import { PrismaNotificationRepository } from '../../database/repositories';

@Module({
  imports: [ConversationsModule],
  providers: [
    MessagingHandlerService,
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: PrismaNotificationRepository,
    },
  ],
  exports: [MessagingHandlerService],
})
export class MessagingModule {}
