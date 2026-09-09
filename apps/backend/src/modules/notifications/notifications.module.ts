import { Module } from '@nestjs/common';
import {
  NOTIFICATION_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaNotificationRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { CalendarModule } from '../calendar/calendar.module';
import { RemindersModule } from '../reminders/reminders.module';
import { TasksModule } from '../tasks/tasks.module';
import { NotificationService } from './notification.service';
import { DailyBriefingService, FollowUpService } from './proactive.service';

@Module({
  imports: [CalendarModule, RemindersModule, TasksModule],
  providers: [
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: PrismaNotificationRepository,
    },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    NotificationService,
    DailyBriefingService,
    FollowUpService,
  ],
  exports: [NOTIFICATION_REPOSITORY, NotificationService, FollowUpService],
})
export class NotificationsModule {}
