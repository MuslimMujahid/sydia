import { Module } from '@nestjs/common';
import { CALENDAR_REPOSITORY } from '../../database/interfaces';
import { PrismaCalendarRepository } from '../../database/repositories';
import { CalendarProviderModule } from '../../infra/calendar';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

@Module({ imports: [CalendarProviderModule], controllers: [CalendarController], providers: [{ provide: CALENDAR_REPOSITORY, useClass: PrismaCalendarRepository }, CalendarService], exports: [CALENDAR_REPOSITORY, CalendarService] })
export class CalendarModule {}
