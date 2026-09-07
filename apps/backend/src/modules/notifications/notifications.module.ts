import { Module } from '@nestjs/common';
import {
  NOTIFICATION_REPOSITORY,
  USER_PRIVACY_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaNotificationRepository,
  PrismaUserPrivacyRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { CalendarModule } from '../calendar/calendar.module';
import { RemindersModule } from '../reminders/reminders.module';
import { TasksModule } from '../tasks/tasks.module';
import { NotificationService } from './notification.service';
import { DailyBriefingService, FollowUpService } from './proactive.service';
import { RetentionService } from './retention.service';

@Module({
  imports: [CalendarModule, RemindersModule, TasksModule],
  providers: [
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: PrismaNotificationRepository,
    },
    { provide: USER_PRIVACY_REPOSITORY, useClass: PrismaUserPrivacyRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    NotificationService,
    DailyBriefingService,
    FollowUpService,
    RetentionService,
  ],
  exports: [
    NOTIFICATION_REPOSITORY,
    NotificationService,
    DailyBriefingService,
    FollowUpService,
    RetentionService,
  ],
})
export class NotificationsModule {}
