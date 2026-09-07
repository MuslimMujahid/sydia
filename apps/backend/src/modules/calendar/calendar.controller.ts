import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import {
  CALENDAR_REPOSITORY,
  type ICalendarRepository,
} from '../../database/interfaces';
import { GoogleCalendarService } from '../../infra/calendar';
import { ApiException, ErrorCodes } from '../../shared/errors';
import {
  CalendarRangeDto,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from './calendar.dto';
import { CalendarService } from './calendar.service';

@Roles(['user'])
@Controller('calendar')
export class CalendarController {
  constructor(
    @Inject(CALENDAR_REPOSITORY)
    private readonly calendars: ICalendarRepository,
    private readonly service: CalendarService,
    private readonly google: GoogleCalendarService,
  ) {}

  @Get('status') async status(@Session() session: UserSession) {
    const status = await this.calendars.status(session.user.id);

    return {
      connected: status?.status === 'connected',
      provider: 'google',
      calendarId: status?.calendarId,
      updatedAt: status?.updatedAt,
      available: this.google.available(),
    };
  }

  @Get('events') list(
    @Session() session: UserSession,
    @Query() range: CalendarRangeDto,
  ) {
    return this.calendars.list(session.user.id, range.from, range.to);
  }

  @Post('events') create(
    @Session() session: UserSession,
    @Body() input: CreateCalendarEventDto,
  ) {
    if (input.endAt <= input.startAt) throw this.badRange();

    return this.service.create(session.user.id, input);
  }

  @Patch('events/:id') async update(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() input: UpdateCalendarEventDto,
  ) {
    if (input.startAt && input.endAt && input.endAt <= input.startAt)
      throw this.badRange();

    return this.required(await this.service.update(session.user.id, id, input));
  }

  @Delete('events/:id') async cancel(
    @Session() session: UserSession,
    @Param('id') id: string,
  ) {
    return this.required(await this.service.cancel(session.user.id, id));
  }

  @Get('google/connect') connect(@Session() session: UserSession) {
    return { url: this.google.authorizationUrl(session.user.id) };
  }

  @Get('google/callback') async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() response: Response,
  ) {
    const userId = this.google.verifyState(state);
    if (!userId)
      throw new ApiException({
        code: ErrorCodes.BAD_REQUEST,
        message: 'State OAuth tidak valid atau kedaluwarsa.',
        status: HttpStatus.BAD_REQUEST,
      });
    const tokens = await this.google.exchange(code);
    await this.calendars.saveIntegration(userId, tokens);
    response.redirect('/calendar?connected=true');
  }

  @Post('disconnect') async disconnect(@Session() session: UserSession) {
    const credentials = await this.calendars.integrationCredentials(
      session.user.id,
    );

    const token = credentials?.refreshToken ?? credentials?.accessToken;
    if (token) await this.google.revoke(token);
    await this.calendars.disconnect(session.user.id);

    return { connected: false };
  }

  private required<T>(value: T | null): T {
    if (!value)
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Event tidak ditemukan.',
        status: HttpStatus.NOT_FOUND,
      });

    return value;
  }

  private badRange(): ApiException {
    return new ApiException({
      code: ErrorCodes.BAD_REQUEST,
      message: 'Waktu selesai harus setelah waktu mulai.',
      status: HttpStatus.BAD_REQUEST,
    });
  }
}
