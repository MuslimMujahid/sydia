import { Module } from '@nestjs/common';
import {
  NOTIFICATION_REPOSITORY,
  REMINDER_REPOSITORY,
  TELEGRAM_REPOSITORY,
  USER_REPOSITORY,
  WHATSAPP_CONNECTION_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaNotificationRepository,
  PrismaReminderRepository,
  PrismaTelegramRepository,
  PrismaUserRepository,
  PrismaWhatsAppConnectionRepository,
} from '../../database/repositories';
import { RemindersController } from './reminders.controller';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { ReminderLifecycleService } from './reminder-lifecycle.service';
import { ReminderDeliveryService } from './reminder-delivery.service';

@Module({
  controllers: [RemindersController],
  providers: [
    { provide: REMINDER_REPOSITORY, useClass: PrismaReminderRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: TELEGRAM_REPOSITORY, useClass: PrismaTelegramRepository },
    {
      provide: WHATSAPP_CONNECTION_REPOSITORY,
      useClass: PrismaWhatsAppConnectionRepository,
    },
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: PrismaNotificationRepository,
    },
    ReminderSchedulerService,
    ReminderLifecycleService,
    ReminderDeliveryService,
  ],
  exports: [
    REMINDER_REPOSITORY,
    ReminderSchedulerService,
    ReminderLifecycleService,
    ReminderDeliveryService,
  ],
})
export class RemindersModule {}
