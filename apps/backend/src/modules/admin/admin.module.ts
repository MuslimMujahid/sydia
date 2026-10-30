import { Module } from '@nestjs/common';
import { ADMIN_REPOSITORY } from '../../database/interfaces';
import { PrismaAdminRepository } from '../../database/repositories';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGiftPlusService } from './admin-gift-plus.service';

@Module({
  controllers: [AdminController],
  providers: [
    {
      provide: ADMIN_REPOSITORY,
      useClass: PrismaAdminRepository,
    },
    AdminService,
    AdminGiftPlusService,
  ],
})
export class AdminModule {}
