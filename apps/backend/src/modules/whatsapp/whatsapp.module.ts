import { Module } from '@nestjs/common';
import { AuditModule } from '../../database/audit.module';
import { ModelGatewayModule } from '../../infra/model-gateway';
import { WhatsAppInfraModule } from '../../infra/whatsapp';
import { ConversationsModule } from '../conversations/conversations.module';
import { DocumentsModule } from '../documents/documents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RemindersModule } from '../reminders/reminders.module';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppNotificationConsumer } from './whatsapp.notification-consumer';
import { WhatsAppService } from './whatsapp.service';
import {
  WHATSAPP_CLOCK,
  WHATSAPP_RANDOM,
  WHATSAPP_SLEEP,
} from './whatsapp.policy';

@Module({
  imports: [
    WhatsAppInfraModule,
    ConversationsModule,
    DocumentsModule,
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
    { provide: WHATSAPP_RANDOM, useValue: () => Math.random() },
    {
      provide: WHATSAPP_SLEEP,
      useValue: (milliseconds: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
    },
  ],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
