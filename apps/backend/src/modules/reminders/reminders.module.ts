import { Module } from '@nestjs/common';
import {
  REMINDER_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaReminderRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { RemindersController } from './reminders.controller';
import { ReminderSchedulerService } from './reminder-scheduler.service';

@Module({
  controllers: [RemindersController],
  providers: [
    { provide: REMINDER_REPOSITORY, useClass: PrismaReminderRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    ReminderSchedulerService,
  ],
  exports: [REMINDER_REPOSITORY, ReminderSchedulerService],
})
export class RemindersModule {}
