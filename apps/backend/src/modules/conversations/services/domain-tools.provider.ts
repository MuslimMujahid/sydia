import { Inject, Injectable } from '@nestjs/common';
import {
  MEMORY_REPOSITORY,
  REMINDER_REPOSITORY,
  TASK_REPOSITORY,
  USER_REPOSITORY,
  type IMemoryRepository,
  type IReminderRepository,
  type ITaskRepository,
  type IUserRepository,
} from '../../../database/interfaces';
import { MemoryService } from '../../memories/memory.service';
import { ReminderSchedulerService } from '../../reminders/reminder-scheduler.service';
import { createDomainTools } from './domain-tools';
import type { AssistantTool } from './tool-executor.service';

@Injectable()
export class DomainToolsProvider {
  readonly tools: AssistantTool[];
  constructor(
    @Inject(TASK_REPOSITORY) tasks: ITaskRepository,
    @Inject(REMINDER_REPOSITORY) reminders: IReminderRepository,
    @Inject(MEMORY_REPOSITORY) memories: IMemoryRepository,
    memoryService: MemoryService,
    scheduler: ReminderSchedulerService,
    @Inject(USER_REPOSITORY) users: IUserRepository,
  ) {
    this.tools = createDomainTools({
      tasks,
      reminders,
      memories,
      memoryService,
      scheduler,
      users,
    });
  }
}
