import { Controller, Get, Inject } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  CALENDAR_REPOSITORY,
  REMINDER_REPOSITORY,
  TASK_REPOSITORY,
  USER_REPOSITORY,
  type ICalendarRepository,
  type IReminderRepository,
  type ITaskRepository,
  type IUserRepository,
} from '../../database/interfaces';
import { dayWindow } from '../../shared/date-time';

@Controller('today')
export class TodayController {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly tasks: ITaskRepository,
    @Inject(REMINDER_REPOSITORY)
    private readonly reminders: IReminderRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(CALENDAR_REPOSITORY) private readonly calendar: ICalendarRepository,
  ) {}

  @Get() async get(@Session() s: UserSession) {
    const now = new Date();
    const timezone = (await this.users.findById(s.user.id))?.timezone ?? 'UTC';
    const window = dayWindow(now, timezone);
    const [tasks, reminders, events] = await Promise.all([
      this.tasks.list(s.user.id, {
        status: ['inbox', 'doing'],
        due: 'today',
        now,
        timezone,
      }),
      this.reminders.list(s.user.id, {
        status: 'scheduled',
        schedule: 'today',
        now,
        timezone,
      }),
      this.calendar.list(s.user.id, window.start, window.end),
    ]);

    return { date: window.date, tasks, reminders, events };
  }
}
