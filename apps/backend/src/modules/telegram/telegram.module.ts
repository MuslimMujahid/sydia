import { Module } from '@nestjs/common';
import { AuditModule } from '../../database/audit.module';
import {
  TELEGRAM_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaTelegramRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { ModelGatewayModule } from '../../infra/model-gateway';
import { TelegramInfraModule } from '../../infra/telegram';
import { DocumentsModule } from '../documents/documents.module';
import { MessagingModule } from '../messaging';
import { NotificationsModule } from '../notifications/notifications.module';
import { RemindersModule } from '../reminders/reminders.module';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramNotificationConsumer } from './telegram.notification-consumer';

@Module({
  imports: [
    TelegramInfraModule,
    MessagingModule,
    DocumentsModule,
    ModelGatewayModule,
    AuditModule,
    NotificationsModule,
    RemindersModule,
  ],
  controllers: [TelegramController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: TELEGRAM_REPOSITORY, useClass: PrismaTelegramRepository },
    TelegramService,
    TelegramNotificationConsumer,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}
