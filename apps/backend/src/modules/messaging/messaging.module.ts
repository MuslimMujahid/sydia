import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { MessagingHandlerService } from './messaging-handler.service';

@Module({
  imports: [ConversationsModule],
  providers: [MessagingHandlerService],
  exports: [MessagingHandlerService],
})
export class MessagingModule {}
