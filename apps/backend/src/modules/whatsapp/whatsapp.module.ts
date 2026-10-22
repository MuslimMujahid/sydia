import { Module } from '@nestjs/common';
import { AuditModule } from '../../database/audit.module';
import { ModelGatewayModule } from '../../infra/model-gateway';
import { WhatsAppInfraModule } from '../../infra/whatsapp';
import { AuthSupportModule } from '../../infra/auth';
import { ConversationsModule } from '../conversations/conversations.module';
import { DocumentsModule } from '../documents/documents.module';
import { MessagingModule } from '../messaging';
import { NotificationsModule } from '../notifications/notifications.module';
import { RemindersModule } from '../reminders/reminders.module';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppNotificationConsumer } from './whatsapp.notification-consumer';
import { WhatsAppService } from './whatsapp.service';
import { WHATSAPP_CLOCK } from './whatsapp.clock';

@Module({
  imports: [
    WhatsAppInfraModule,
    AuthSupportModule,
    ConversationsModule,
    DocumentsModule,
    MessagingModule,
    ModelGatewayModule,
    AuditModule,
    NotificationsModule,
    RemindersModule,
  ],
  controllers: [WhatsAppController],
  providers: [
    WhatsAppService,
    WhatsAppNotificationConsumer,
    { provide: WHATSAPP_CLOCK, useValue: () => new Date() },
  ],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
