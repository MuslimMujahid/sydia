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
  ReminderActionError,
  ReminderLifecycleService,
} from './reminder-lifecycle.service';
import {
  AcknowledgeReminderDto,
  CreateReminderDto,
  ReminderFiltersDto,
  SnoozeReminderDto,
  UpdateReminderDto,
} from './reminder.dto';

const ACTION_MESSAGES = {
  not_dispatched:
    'Pengingat ini belum berbunyi. Ubah waktunya alih-alih menunda.',
  too_soon: 'Waktu tunda minimal 1 menit dari sekarang.',
  needs_confirmation:
    'Waktu tunda melewati jadwal berikutnya dari pengingat berulang ini. Konfirmasi untuk melanjutkan.',
} as const;

@Roles(['user'])
@Controller('reminders')
export class RemindersController {
  constructor(
    @Inject(REMINDER_REPOSITORY)
    private readonly reminders: IReminderRepository,
    private readonly scheduler: ReminderSchedulerService,
    private readonly lifecycle: ReminderLifecycleService,
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
    // snapped onto it. Snoozing is a separate endpoint (specs/008).
    const effective = recurrence ?? current.recurrence;
    const requestedAt = input.scheduledAt
      ? new Date(input.scheduledAt)
      : undefined;

    const scheduledAt =
      requestedAt && effective
        ? firstOccurrence(effective, requestedAt, current.timezone)
        : requestedAt;

    const reminder = await this.reminders.update(s.user.id, id, {
      ...input,
      scheduledAt,
      recurrence,
    });

    const value = this.required(reminder);
    await this.lifecycle.afterUpdate(s.user.id, current, value);
    await this.record(s.user.id, 'reminder.updated', id);

    return this.required(await this.reminders.findById(s.user.id, id));
  }

  @Post(':id/snooze') async snooze(
    @Session() s: UserSession,
    @Param('id') id: string,
    @Body() input: SnoozeReminderDto,
  ) {
    const result = await this.action(() =>
      this.lifecycle.snooze(s.user.id, {
        reminderId: input.occurrenceId ? undefined : id,
        occurrenceId: input.occurrenceId,
        until: new Date(input.until),
        confirmPastNextOccurrence: input.confirmPastNextOccurrence,
        source: { type: 'dashboard' },
      }),
    );

    if (result.snoozed.reminderId !== id) throw this.notFound();
    await this.record(s.user.id, 'reminder.snoozed', id);

    return result.reminder;
  }

  @Post(':id/acknowledge') @HttpCode(HttpStatus.OK) async acknowledge(
    @Session() s: UserSession,
    @Param('id') id: string,
    @Body() input: AcknowledgeReminderDto,
  ) {
    if (input.occurrenceId) {
      const occurrence = await this.reminders.findOccurrence(
        s.user.id,
        input.occurrenceId,
      );

      if (occurrence?.reminderId !== id) throw this.notFound();
    }

    const acknowledged = await this.action(() =>
      this.lifecycle.acknowledge(s.user.id, {
        reminderId: input.occurrenceId ? undefined : id,
        occurrenceId: input.occurrenceId,
      }),
    );

    if (acknowledged.length)
      await this.record(s.user.id, 'reminder.acknowledged', id);

    return { acknowledged };
  }

  @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT) async remove(
    @Session() s: UserSession,
    @Param('id') id: string,
  ) {
    if (!(await this.reminders.delete(s.user.id, id))) throw this.notFound();
    await this.scheduler.cancel(id);
    await this.record(s.user.id, 'reminder.deleted', id);
  }

  private async action<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof ReminderActionError)) throw error;
      if (error.code === 'not_found') throw this.notFound();

      throw new ApiException({
        code: ErrorCodes.BAD_REQUEST,
        message: ACTION_MESSAGES[error.code],
        status: HttpStatus.BAD_REQUEST,
        details: { reason: error.code },
      });
    }
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
