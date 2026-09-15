import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  AUDIT_EVENT_REPOSITORY,
  REMINDER_REPOSITORY,
  USER_REPOSITORY,
  type IAuditEventRepository,
  type IReminderRepository,
  type IUserRepository,
} from '../../database/interfaces';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { firstOccurrence } from '../../shared/date-time';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import {
  CreateReminderDto,
  ReminderFiltersDto,
  UpdateReminderDto,
} from './reminder.dto';

@Roles(['user'])
@Controller('reminders')
export class RemindersController {
  constructor(
    @Inject(REMINDER_REPOSITORY)
    private readonly reminders: IReminderRepository,
    private readonly scheduler: ReminderSchedulerService,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly audit: IAuditEventRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
  ) {}

  @Get() async list(@Session() s: UserSession, @Query() q: ReminderFiltersDto) {
    const timezone = (await this.users.findById(s.user.id))?.timezone ?? 'UTC';

    return this.reminders.list(s.user.id, { ...q, timezone });
  }

  @Get(':id') async get(@Session() s: UserSession, @Param('id') id: string) {
    return this.required(await this.reminders.findById(s.user.id, id));
  }

  @Post() async create(
    @Session() s: UserSession,
    @Body() input: CreateReminderDto,
  ) {
    const timezone = await this.scheduler.timezoneFor(s.user.id);
    const scheduledAt = new Date(input.scheduledAt);
    const recurrence = input.recurrence
      ? {
          ...input.recurrence,
          ...(input.recurrence.daysOfWeek
            ? {
                daysOfWeek: [...input.recurrence.daysOfWeek].sort(
                  (a, b) => a - b,
                ),
              }
            : {}),
        }
      : null;

    const reminder = await this.reminders.create(s.user.id, {
      ...input,
      scheduledAt: recurrence
        ? firstOccurrence(recurrence, scheduledAt, timezone)
        : scheduledAt,
      timezone,
      recurrence,
    });

    await this.scheduler.schedule(reminder);
    await this.record(s.user.id, 'reminder.created', reminder.id);

    return reminder;
  }

  @Patch(':id') async update(
    @Session() s: UserSession,
    @Param('id') id: string,
    @Body() input: UpdateReminderDto,
  ) {
    const requested = input.snoozeUntil ?? input.scheduledAt;
    const current = this.required(await this.reminders.findById(s.user.id, id));
    const recurrence =
      input.recurrence === undefined || input.recurrence === null
        ? input.recurrence
        : {
            ...input.recurrence,
            ...(input.recurrence.daysOfWeek
              ? {
                  daysOfWeek: [...input.recurrence.daysOfWeek].sort(
                    (a, b) => a - b,
                  ),
                }
              : {}),
          };

    // A later recurrence replaces the rule, so the requested instant must be
    // snapped onto it; a snooze keeps its absolute instant.
    const effective = recurrence ?? current.recurrence;
    const requestedAt = requested ? new Date(requested) : undefined;
    const scheduledAt =
      requestedAt && !input.snoozeUntil && effective
        ? firstOccurrence(effective, requestedAt, current.timezone)
        : requestedAt;

    const reminder = await this.reminders.update(s.user.id, id, {
      ...input,
      scheduledAt,
      recurrence,
      status: input.snoozeUntil ? 'scheduled' : input.status,
    });

    const value = this.required(reminder);
    await this.scheduler.schedule(value);
    await this.record(s.user.id, 'reminder.updated', id);

    return value;
  }

  @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT) async remove(
    @Session() s: UserSession,
    @Param('id') id: string,
  ) {
    if (!(await this.reminders.delete(s.user.id, id))) throw this.notFound();
    await this.scheduler.cancel(id);
    await this.record(s.user.id, 'reminder.deleted', id);
  }

  private required<T>(value: T | null): T {
    if (!value) throw this.notFound();

    return value;
  }

  private notFound() {
    return new ApiException({
      code: ErrorCodes.NOT_FOUND,
      message: 'Pengingat tidak ditemukan.',
      status: HttpStatus.NOT_FOUND,
    });
  }

  private record(userId: string, eventType: string, id: string) {
    return this.audit.record({ userId, eventType, metadata: { id } });
  }
}
