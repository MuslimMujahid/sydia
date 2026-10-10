import { Module } from '@nestjs/common';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleCalendarRequestLimiter } from './google-calendar-request-limiter.service';

@Module({
  providers: [GoogleCalendarRequestLimiter, GoogleCalendarService],
  exports: [GoogleCalendarRequestLimiter, GoogleCalendarService],
})
export class CalendarProviderModule {}
