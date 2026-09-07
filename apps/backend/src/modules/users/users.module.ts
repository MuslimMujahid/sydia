import { Module } from '@nestjs/common';
import { AuditModule } from '../../database/audit.module';
import { CalendarModule } from '../calendar/calendar.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RemindersModule } from '../reminders/reminders.module';
import { TasksModule } from '../tasks/tasks.module';
import {
  EXTERNAL_IDENTITY_REPOSITORY,
  USER_PRIVACY_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaExternalIdentityRepository,
  PrismaUserPrivacyRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { UsersController } from './users.controller';
import {
  GetUserService,
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
    UpdateUserProfileService,
    UserPreferencesService,
    UserPrivacyService,
  ],
  exports: [UserPrivacyService],
})
export class UsersModule {}
