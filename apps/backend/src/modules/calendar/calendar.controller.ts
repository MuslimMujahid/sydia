import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  AllowAnonymous,
  Roles,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import {
  CALENDAR_REPOSITORY,
  type ICalendarRepository,
} from '../../database/interfaces';
import type { CalendarEventWrite } from '../../database/entities';
import { GoogleCalendarService } from '../../infra/calendar';
import { ApiException, ErrorCodes } from '../../shared/errors';
import {
  CalendarRangeDto,
  CreateCalendarEventDto,
  ResolveCalendarConflictDto,
  ResolveCalendarOccurrenceDto,
  SelectGoogleCalendarDto,
  UpdateCalendarEventDto,
} from './calendar.dto';
import { CalendarService } from './calendar.service';
import { CalendarReadService } from './calendar-read.service';
import { CalendarSyncService } from './calendar-sync.service';
import {
  CalendarOAuthService,
  GOOGLE_CALENDAR_OAUTH_COOKIE,
} from './calendar-oauth.service';

type CalendarWriteFields = {
  title?: string;
  description?: string | null;
  location?: string | null;
  attendees?: string[];
  recurrence?: string[];
};

function temporalInputError(): ApiException {
  return new ApiException({
    code: ErrorCodes.BAD_REQUEST,
    message: 'Provide either a timed event or an all-day date range.',
    status: HttpStatus.BAD_REQUEST,
  });
}

function commonWriteFields(input: CalendarWriteFields) {
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined
      ? { description: input.description }
      : {}),
    ...(input.location !== undefined ? { location: input.location } : {}),
    ...(input.attendees !== undefined ? { attendees: input.attendees } : {}),
    ...(input.recurrence !== undefined ? { recurrence: input.recurrence } : {}),
  };
}

function createWrite(input: CreateCalendarEventDto): CalendarEventWrite {
  const hasTimedFields =
    input.startAt !== undefined ||
    input.endAt !== undefined ||
    input.timezone !== undefined;

  const hasAllDayFields =
    input.allDayStartDate !== undefined || input.allDayEndDate !== undefined;

  const common = commonWriteFields(input);

  if (
    hasAllDayFields &&
    !hasTimedFields &&
    input.allDayStartDate &&
    input.allDayEndDate &&
    input.allDayEndDate > input.allDayStartDate
  )
    return {
      ...common,
      title: input.title,
      allDayStartDate: input.allDayStartDate,
      allDayEndDate: input.allDayEndDate,
    };

  if (
    !hasAllDayFields &&
    input.startAt &&
    input.endAt &&
    input.timezone &&
    input.endAt > input.startAt
  )
    return {
      ...common,
      title: input.title,
      startAt: input.startAt,
      endAt: input.endAt,
      timezone: input.timezone,
    };

  throw temporalInputError();
}

function updateWrite(
  input: UpdateCalendarEventDto,
): Partial<CalendarEventWrite> {
  const hasTimedFields =
    input.startAt !== undefined ||
    input.endAt !== undefined ||
    input.timezone !== undefined;

  const hasAllDayFields =
    input.allDayStartDate !== undefined || input.allDayEndDate !== undefined;

  const common = commonWriteFields(input);

  if (hasTimedFields && hasAllDayFields) throw temporalInputError();

  if (hasAllDayFields) {
    if (
      !input.allDayStartDate ||
      !input.allDayEndDate ||
      input.allDayEndDate <= input.allDayStartDate
    )
      throw temporalInputError();

    return {
      ...common,
      allDayStartDate: input.allDayStartDate,
      allDayEndDate: input.allDayEndDate,
    };
  }

  if (input.startAt && input.endAt && input.endAt <= input.startAt)
    throw temporalInputError();

  return {
    ...common,
    ...(input.startAt ? { startAt: input.startAt } : {}),
    ...(input.endAt ? { endAt: input.endAt } : {}),
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
  };
}

@Roles(['user'])
@Controller('calendar')
export class CalendarController {
  constructor(
    @Inject(CALENDAR_REPOSITORY)
    private readonly calendars: ICalendarRepository,
    private readonly service: CalendarService,
    private readonly calendarRead: CalendarReadService,
    private readonly google: GoogleCalendarService,
    private readonly oauth: CalendarOAuthService,
    private readonly sync: CalendarSyncService,
  ) {}

  @Get('status') async status(@Session() session: UserSession) {
    const [status, sync] = await Promise.all([
      this.calendars.status(session.user.id),
      this.calendars.syncStatus(session.user.id),
    ]);

    return {
      connected: status?.status === 'connected',
      connectionStatus: status?.status ?? 'disconnected',
      cleanupPending: status?.status === 'disconnecting',
      provider: 'google',
      googleEmail: sync?.googleEmail ?? status?.googleEmail,
      calendarId: sync?.calendarId ?? status?.calendarId,
      calendarName: sync?.calendarName ?? null,
      bindingState: sync?.bindingState ?? null,
      lastSyncedAt: sync?.lastSyncedAt ?? null,
      lastErrorCode: sync?.lastErrorCode ?? null,
      pendingOperationCount: sync?.pendingOperationCount ?? 0,
      openConflictCount: sync?.openConflictCount ?? 0,
      watchExpiresAt: sync?.watchExpiresAt ?? null,
      updatedAt: status?.updatedAt,
      available: this.google.available(),
    };
  }

  @Get('events') list(
    @Session() session: UserSession,
    @Query() range: CalendarRangeDto,
  ) {
    return this.calendarRead.list(session.user.id, range.from, range.to);
  }

  @Get('events/:id') async getEvent(
    @Session() session: UserSession,
    @Param('id') id: string,
  ) {
    return this.required(await this.service.findById(session.user.id, id));
  }

  @Post('events/:id/retry-sync')
  @HttpCode(HttpStatus.OK)
  retryEventSync(@Session() session: UserSession, @Param('id') id: string) {
    this.requireGoogleCalendarAvailable();

    return this.service.retrySync(session.user.id, id);
  }

  @Post('events/occurrences/resolve') async resolveOccurrence(
    @Session() session: UserSession,
    @Body() input: ResolveCalendarOccurrenceDto,
  ) {
    const series = await this.service.findById(
      session.user.id,
      input.seriesEventId,
    );

    if (!series) return this.required(null);

    if (series.provider === 'local') {
      const occurrence =
        await this.calendarRead.resolveLocalOccurrenceForMutation(
          session.user.id,
          input.seriesEventId,
          input.occurrenceKey,
        );

      if (!occurrence)
        throw new ApiException({
          code: ErrorCodes.CONFLICT,
          message: 'Kejadian ini berubah. Muat ulang kalender lalu coba lagi.',
          status: HttpStatus.CONFLICT,
        });

      return occurrence;
    }

    this.requireGoogleCalendarAvailable();

    return this.required(
      await this.sync.resolveGoogleOccurrenceForMutation(
        session.user.id,
        input,
      ),
    );
  }

  @Get('google/calendars') async listGoogleCalendars(
    @Session() session: UserSession,
  ) {
    this.requireGoogleCalendarAvailable();

    const [accessToken, requestContext] = await Promise.all([
      this.sync.accessTokenForUser(session.user.id),
      this.sync.requestContextForUser(session.user.id, 'interactive'),
    ]);

    if (!accessToken || !requestContext)
      throw new ApiException({
        code: ErrorCodes.CONFLICT,
        message: 'Hubungkan Google Calendar untuk melihat pilihan kalender.',
        status: HttpStatus.CONFLICT,
      });

    return (
      await this.google.listCalendars(accessToken, requestContext)
    ).filter((calendar) => calendar.writable);
  }

  @Post('google/calendar') async selectGoogleCalendar(
    @Session() session: UserSession,
    @Body() input: SelectGoogleCalendarDto,
  ) {
    this.requireGoogleCalendarAvailable();

    const [accessToken, requestContext] = await Promise.all([
      this.sync.accessTokenForUser(session.user.id),
      this.sync.requestContextForUser(session.user.id, 'interactive'),
    ]);

    if (!accessToken || !requestContext)
      throw new ApiException({
        code: ErrorCodes.CONFLICT,
        message: 'Hubungkan Google Calendar sebelum memilih kalender.',
        status: HttpStatus.CONFLICT,
      });

    const selected = (
      await this.google.listCalendars(accessToken, requestContext)
    ).find((calendar) => calendar.id === input.calendarId && calendar.writable);

    if (!selected)
      throw new ApiException({
        code: ErrorCodes.BAD_REQUEST,
        message: 'Kalender tidak tersedia atau tidak memiliki akses tulis.',
        status: HttpStatus.BAD_REQUEST,
      });

    return this.service.selectGoogleCalendar(session.user.id, selected);
  }

  @Get('conflicts') listConflicts(@Session() session: UserSession) {
    return this.service.listOpenConflicts(session.user.id);
  }

  @Post('conflicts/:id/resolve') resolveConflict(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() input: ResolveCalendarConflictDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.resolveConflict(
      session.user.id,
      id,
      input.resolution,
      input.expectedLocalRevision,
      input.expectedRemoteEtag ?? null,
      this.requestKey(idempotencyKey),
    );
  }

  @Post('events') create(
    @Session() session: UserSession,
    @Body() input: CreateCalendarEventDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.create(
      session.user.id,
      createWrite(input),
      input.destination ?? 'auto',
      this.requestKey(idempotencyKey),
    );
  }

  @Post('events/:id/copy') async copyToLocal(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.required(
      await this.service.copyToLocal(
        session.user.id,
        id,
        this.requestKey(idempotencyKey),
      ),
    );
  }

  @Post('events/:id/export') async exportToGoogle(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    this.requireGoogleCalendarAvailable();

    return this.required(
      await this.service.exportToGoogle(
        session.user.id,
        id,
        this.requestKey(idempotencyKey),
      ),
    );
  }

  @Patch('events/:id') async update(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() input: UpdateCalendarEventDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.required(
      await this.service.update(
        session.user.id,
        id,
        updateWrite(input),
        this.requestKey(idempotencyKey),
      ),
    );
  }

  @Delete('events/:id') async cancel(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.required(
      await this.service.cancel(
        session.user.id,
        id,
        this.requestKey(idempotencyKey),
      ),
    );
  }

  @Post('google/connect')
  @HttpCode(HttpStatus.OK)
  async connect(
    @Session() session: UserSession,
    @Res({ passthrough: true }) response: Response,
  ) {
    const request = await this.oauth.begin(session.user.id, session.session.id);

    response.cookie(GOOGLE_CALENDAR_OAUTH_COOKIE, request.browserNonce, {
      httpOnly: true,
      secure: request.secureCookie,
      sameSite: 'lax',
      maxAge: 10 * 60_000,
      path: '/calendar/google/callback',
    });

    return { url: request.authorizationUrl };
  }

  @Post('disconnect') async disconnect(@Session() session: UserSession) {
    return this.oauth.disconnect(session.user.id);
  }

  @Post('admin/users/:userId/full-resync')
  @Roles(['admin'])
  @HttpCode(HttpStatus.ACCEPTED)
  async requestUserFullResync(@Param('userId') userId: string) {
    this.requireGoogleCalendarAvailable();

    const result = await this.sync.requestFullResync(userId);
    if (result.status === 'queued')
      return {
        accepted: true,
        fullImportGeneration: result.fullImportGeneration,
      };

    if (result.status === 'missing')
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        message: 'User not found.',
        status: HttpStatus.NOT_FOUND,
      });

    if (result.status === 'busy')
      throw new ApiException({
        code: ErrorCodes.CONFLICT,
        message: 'Calendar synchronization is already running for this user.',
        status: HttpStatus.CONFLICT,
      });

    throw new ApiException({
      code: ErrorCodes.CONFLICT,
      message: 'This user has no active Google Calendar binding to resync.',
      status: HttpStatus.CONFLICT,
    });
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

  private requireGoogleCalendarAvailable(): void {
    if (this.google.available()) return;

    throw new ApiException({
      code: ErrorCodes.SERVICE_UNAVAILABLE,
      message: 'Google Calendar sync is unavailable on this server.',
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
  }

  private badRange(): ApiException {
    return new ApiException({
      code: ErrorCodes.BAD_REQUEST,
      message: 'Waktu selesai harus setelah waktu mulai.',
      status: HttpStatus.BAD_REQUEST,
    });
  }

  private requestKey(value?: string): string {
    if (value && /^[A-Za-z0-9._:-]{1,128}$/.test(value)) return value;

    throw new ApiException({
      code: ErrorCodes.BAD_REQUEST,
      message: 'A valid Idempotency-Key header is required.',
      status: HttpStatus.BAD_REQUEST,
    });
  }
}

@AllowAnonymous()
@Controller('calendar/google')
export class GoogleCalendarCallbackController {
  private readonly secureCookie: boolean;

  constructor(
    private readonly oauth: CalendarOAuthService,
    private readonly google: GoogleCalendarService,
    config: ConfigService,
  ) {
    const redirectUri = config.get<string>('BACKEND_GOOGLE_REDIRECT_URI');
    this.secureCookie =
      this.google.available() && redirectUri
        ? new URL(redirectUri).protocol === 'https:'
        : false;
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const browserNonce = this.cookie(
      request.headers.cookie,
      GOOGLE_CALENDAR_OAUTH_COOKIE,
    );

    const outcome = await this.oauth.callback({
      code,
      state,
      providerError,
      browserNonce,
    });

    response.clearCookie(GOOGLE_CALENDAR_OAUTH_COOKIE, {
      httpOnly: true,
      secure: this.secureCookie,
      sameSite: 'lax',
      path: '/calendar/google/callback',
    });
    response.redirect(outcome.redirectUrl);
  }

  private cookie(header: string | undefined, name: string): string | undefined {
    const prefix = `${name}=`;
    const value = header
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length);

    return value || undefined;
  }
}

@AllowAnonymous()
@Controller('calendar/google')
export class GoogleCalendarWebhookController {
  constructor(private readonly sync: CalendarSyncService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.NO_CONTENT)
  async webhook(
    @Headers('x-goog-channel-id') channelId: string | undefined,
    @Headers('x-goog-channel-token') channelToken: string | undefined,
    @Headers('x-goog-resource-id') resourceId: string | undefined,
    @Headers('x-goog-message-number') messageNumber: string | undefined,
  ): Promise<void> {
    await this.sync.webhook({
      channelId,
      channelToken,
      resourceId,
      messageNumber,
    });
  }
}
