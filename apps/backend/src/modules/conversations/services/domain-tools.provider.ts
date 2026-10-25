import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  CALENDAR_REPOSITORY,
  CATEGORY_REPOSITORY,
  CONTACT_GROUP_REPOSITORY,
  CONTACT_REPOSITORY,
  REMINDER_REPOSITORY,
  TASK_REPOSITORY,
  USER_REPOSITORY,
  type ICategoryRepository,
  type IContactGroupRepository,
  type IReminderRepository,
  type ITaskRepository,
  type IUserRepository,
  type ICalendarRepository,
  type IContactRepository,
} from '../../../database/interfaces';
import { MemoryAccessService } from '../../memories/memory-access.service';
import { ReminderSchedulerService } from '../../reminders/reminder-scheduler.service';
import { CalendarService } from '../../calendar/calendar.service';
import { CalendarReadService } from '../../calendar/calendar-read.service';
import { CalendarSyncService } from '../../calendar/calendar-sync.service';
import { SecretsService } from '../../secrets/secrets.service';
import { DocumentService } from '../../documents/document.service';
import { DailyNoteService } from '../../daily-notes/daily-note.service';
import { createDomainTools } from './domain-tools';
import { createPhaseTools } from './phase-tools';
import { createDailyNoteTools } from './daily-note-tools';
import { NotesService } from '../../notes/notes.service';
import { createNotesWorkspaceTools } from './notes-workspace-tools';
import type { AssistantTool } from './tool-executor.service';
import { validateToolGroups } from './tool-groups';
import {
  AssistancePolicyService,
  AssistantActionService,
  AvailabilityService,
  createSecretaryTools,
  SkillCatalogService,
  WorkContextService,
} from '../../secretary';

@Injectable()
export class DomainToolsProvider {
  readonly tools: AssistantTool[];
  constructor(
    @Inject(TASK_REPOSITORY) tasks: ITaskRepository,
    @Inject(CATEGORY_REPOSITORY) categories: ICategoryRepository,
    @Inject(REMINDER_REPOSITORY) reminders: IReminderRepository,
    memoryService: MemoryAccessService,
    scheduler: ReminderSchedulerService,
    @Inject(USER_REPOSITORY) users: IUserRepository,
    @Inject(CONTACT_REPOSITORY) contacts: IContactRepository,
    @Inject(CONTACT_GROUP_REPOSITORY)
    contactGroups: IContactGroupRepository,
    documents: DocumentService,
    @Inject(CALENDAR_REPOSITORY) calendars: ICalendarRepository,
    calendarService: CalendarService,
    calendarRead: CalendarReadService,
    calendarSync: CalendarSyncService,
    secrets: SecretsService,
    dailyNotes: DailyNoteService,
    notes: NotesService,
    @Optional() skills?: SkillCatalogService,
    @Optional() workContext?: WorkContextService,
    @Optional() availability?: AvailabilityService,
    @Optional() actions?: AssistantActionService,
    @Optional() policy?: AssistancePolicyService,
  ) {
    this.tools = [
      ...createDomainTools({
        tasks,
        categories,
        reminders,
        memoryService,
        scheduler,
        users,
        secrets,
      }),
      ...createPhaseTools({
        contacts,
        contactGroups,
        documents,
        calendars,
        calendarService,
        calendarRead,
        calendarSync,
        users,
      }),
      ...createDailyNoteTools({ dailyNotes }),
      ...createNotesWorkspaceTools(notes),
      ...(skills && workContext && availability && actions && policy
        ? createSecretaryTools({
            skills: skills.skills,
            context: workContext,
            availability,
            actions,
            policy,
          })
        : []),
    ];
    const names = this.tools.map(({ definition }) => definition.name);
    // Harnesses without the secretary module register only domain tools.
    validateToolGroups(names, skills ? [] : ['assistance']);
    skills?.validateTools(names);
  }
}
