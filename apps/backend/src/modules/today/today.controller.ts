import { Controller, Get, Inject } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  REMINDER_REPOSITORY,
  TASK_REPOSITORY,
  USER_REPOSITORY,
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
  ) {}

  @Get() async get(@Session() s: UserSession) {
    const now = new Date();
    const timezone = (await this.users.findById(s.user.id))?.timezone ?? 'UTC';
    const [tasks, reminders] = await Promise.all([
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
    ]);

    return { date: dayWindow(now, timezone).date, tasks, reminders };
  }
}
