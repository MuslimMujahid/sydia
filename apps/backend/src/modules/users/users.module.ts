import { Module } from '@nestjs/common';
import { AuditModule } from '../../database/audit.module';
import { CalendarModule } from '../calendar/calendar.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RemindersModule } from '../reminders/reminders.module';
import { TasksModule } from '../tasks/tasks.module';
import { MemoriesModule } from '../memories/memories.module';
import {
  ATTRIBUTION_REPOSITORY,
  EXTERNAL_IDENTITY_REPOSITORY,
  USER_PRIVACY_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaAttributionRepository,
  PrismaExternalIdentityRepository,
  PrismaUserPrivacyRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { UsersController } from './users.controller';
import {
  GetUserService,
  RecordAttributionService,
  UpdateUserProfileService,
  UserPreferencesService,
  UserPrivacyService,
} from './services';

@Module({
  imports: [
    AuditModule,
    CalendarModule,
    NotificationsModule,
    TasksModule,
    RemindersModule,
    MemoriesModule,
  ],
  controllers: [UsersController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    GetUserService,
    {
      provide: EXTERNAL_IDENTITY_REPOSITORY,
      useClass: PrismaExternalIdentityRepository,
    },
    { provide: USER_PRIVACY_REPOSITORY, useClass: PrismaUserPrivacyRepository },
    { provide: ATTRIBUTION_REPOSITORY, useClass: PrismaAttributionRepository },
    UpdateUserProfileService,
    UserPreferencesService,
    UserPrivacyService,
    RecordAttributionService,
  ],
  exports: [UserPrivacyService],
})
export class UsersModule {}
