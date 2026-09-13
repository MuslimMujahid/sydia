import { Module } from '@nestjs/common';
import {
  NOTIFICATION_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaNotificationRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { ModelGatewayModule } from '../../infra/model-gateway';
import { CalendarModule } from '../calendar/calendar.module';
import { RemindersModule } from '../reminders/reminders.module';
import { TasksModule } from '../tasks/tasks.module';
import { NotificationService } from './notification.service';
import { NotificationComposerService } from './notification-composer.service';
import { ProactiveSchedulerService } from './proactive-scheduler.service';
import { NOTIFICATION_RANDOM } from './notification-templates';
import { DailyBriefingService, FollowUpService } from './proactive.service';

@Module({
  imports: [CalendarModule, RemindersModule, TasksModule, ModelGatewayModule],
  providers: [
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: PrismaNotificationRepository,
    },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: NOTIFICATION_RANDOM, useValue: () => Math.random() },
    NotificationService,
    NotificationComposerService,
    ProactiveSchedulerService,
    DailyBriefingService,
    FollowUpService,
  ],
  exports: [
    NOTIFICATION_REPOSITORY,
    NotificationService,
    NotificationComposerService,
    ProactiveSchedulerService,
    FollowUpService,
  ],
})
export class NotificationsModule {}
