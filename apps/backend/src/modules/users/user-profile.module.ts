import { Module } from '@nestjs/common';
import { AuditModule } from '../../database/audit.module';
import { USER_REPOSITORY } from '../../database/interfaces';
import { PrismaUserRepository } from '../../database/repositories';
import { UpdateUserProfileService } from './services/update-user-profile.service';

@Module({
  imports: [AuditModule],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    UpdateUserProfileService,
  ],
  exports: [UpdateUserProfileService],
})
export class UserProfileModule {}

export { UpdateUserProfileService };
