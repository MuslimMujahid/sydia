import { Inject, Injectable } from '@nestjs/common';
import {
  CALENDAR_REPOSITORY,
  CATEGORY_REPOSITORY,
  CONTACT_REPOSITORY,
  MEMORY_REPOSITORY,
  REMINDER_REPOSITORY,
  TASK_REPOSITORY,
  USER_REPOSITORY,
  type ICategoryRepository,
  type IMemoryRepository,
  type IReminderRepository,
  type ITaskRepository,
  type IUserRepository,
  type ICalendarRepository,
  type IContactRepository,
} from '../../../database/interfaces';
import { MemoryService } from '../../memories/memory.service';
import { ReminderSchedulerService } from '../../reminders/reminder-scheduler.service';
import { CalendarService } from '../../calendar/calendar.service';
import { SecretsService } from '../../secrets/secrets.service';
import { DocumentService } from '../../documents/document.service';
import { createDomainTools } from './domain-tools';
import { createPhaseTools } from './phase-tools';
import type { AssistantTool } from './tool-executor.service';

@Injectable()
export class DomainToolsProvider {
  readonly tools: AssistantTool[];
  constructor(
    @Inject(TASK_REPOSITORY) tasks: ITaskRepository,
    @Inject(CATEGORY_REPOSITORY) categories: ICategoryRepository,
    @Inject(REMINDER_REPOSITORY) reminders: IReminderRepository,
    @Inject(MEMORY_REPOSITORY) memories: IMemoryRepository,
    memoryService: MemoryService,
    scheduler: ReminderSchedulerService,
    @Inject(USER_REPOSITORY) users: IUserRepository,
    @Inject(CONTACT_REPOSITORY) contacts: IContactRepository,
    documents: DocumentService,
    @Inject(CALENDAR_REPOSITORY) calendars: ICalendarRepository,
    calendarService: CalendarService,
    secrets: SecretsService,
  ) {
    this.tools = [
      ...createDomainTools({
        tasks,
        categories,
        reminders,
        memories,
        memoryService,
        scheduler,
        users,
        secrets,
      }),
      ...createPhaseTools({
        contacts,
        documents,
        calendars,
        calendarService,
        users,
      }),
    ];
  }
}
