import { Module } from '@nestjs/common';
import { AuditModule } from '../../database/audit.module';
import {
  EXTERNAL_IDENTITY_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaExternalIdentityRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { UsersController } from './users.controller';
import { GetUserService, UpdateUserProfileService } from './services';

@Module({
  imports: [AuditModule],
  controllers: [UsersController],
  providers: [
    {
      provide: USER_REPOSITORY,
      useClass: PrismaUserRepository,
    },
    GetUserService,
    {
      provide: EXTERNAL_IDENTITY_REPOSITORY,
      useClass: PrismaExternalIdentityRepository,
    },
    UpdateUserProfileService,
  ],
})
export class UsersModule {}
