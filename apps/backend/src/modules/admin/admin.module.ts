import { AdminDashboardService } from './admin-dashboard.service';
import { Module } from '@nestjs/common';
import {
  ADMIN_ANALYTICS_REPOSITORY,
  ADMIN_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaAdminAnalyticsRepository,
  PrismaAdminRepository,
} from '../../database/repositories';
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
    {
      provide: ADMIN_ANALYTICS_REPOSITORY,
      useClass: PrismaAdminAnalyticsRepository,
    },
    AdminDashboardService,
    AdminService,
    AdminGiftPlusService,
  ],
})
export class AdminModule {}
