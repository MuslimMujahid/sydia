import { Module } from '@nestjs/common';
import { CALENDAR_REPOSITORY } from '../../database/interfaces';
import { PrismaCalendarRepository } from '../../database/repositories';
import { CalendarProviderModule } from '../../infra/calendar';
import {
  CalendarController,
  GoogleCalendarCallbackController,
  GoogleCalendarWebhookController,
} from './calendar.controller';
import { CalendarReminderService } from './calendar-reminder.service';
import { CalendarService } from './calendar.service';
import { CalendarReadService } from './calendar-read.service';
import { CalendarOAuthService } from './calendar-oauth.service';
import { CalendarSyncService } from './calendar-sync.service';

@Module({
  imports: [CalendarProviderModule],
  controllers: [
    CalendarController,
    GoogleCalendarCallbackController,
    GoogleCalendarWebhookController,
  ],
  providers: [
    { provide: CALENDAR_REPOSITORY, useClass: PrismaCalendarRepository },
    CalendarService,
    CalendarReadService,
    CalendarReminderService,
    CalendarOAuthService,
    CalendarSyncService,
  ],
  exports: [
    CALENDAR_REPOSITORY,
    CalendarService,
    CalendarReadService,
    CalendarReminderService,
    CalendarSyncService,
    CalendarProviderModule,
  ],
})
export class CalendarModule {}
