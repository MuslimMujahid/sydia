import { Module } from '@nestjs/common';
import {
  REMINDER_REPOSITORY,
  TASK_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaReminderRepository,
  PrismaTaskRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { TodayController } from './today.controller';

@Module({
  controllers: [TodayController],
  providers: [
    { provide: TASK_REPOSITORY, useClass: PrismaTaskRepository },
    { provide: REMINDER_REPOSITORY, useClass: PrismaReminderRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
  ],
})
export class TodayModule {}
