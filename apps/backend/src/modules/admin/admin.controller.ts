import { AdminDashboardService } from './admin-dashboard.service';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { IsIn } from 'class-validator';
import type { AdminAction } from './admin.service';
import { AdminService } from './admin.service';
import { AdminDashboardQueryDto, AdminUsersQueryDto } from './admin-users.dto';
import { AdminGiftPlusDto } from './admin-gift-plus.dto';
import { AdminGiftPlusService } from './admin-gift-plus.service';

const ADMIN_ACTIONS = ['ban', 'unban', 'force-sign-out', 'delete'] as const;

class AdminActionDto {
  @IsIn(ADMIN_ACTIONS)
  action!: AdminAction;
}

@Roles(['admin'])
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly gifts: AdminGiftPlusService,
    private readonly dashboards: AdminDashboardService,
  ) {}

  @Post('users/:userId/gift-plus')
  async giftPlus(
    @Session() session: UserSession,
    @Param('userId') userId: string,
    @Body() input: AdminGiftPlusDto,
  ) {
    const result = await this.gifts.gift(session.user.id, userId, input);
    this.dashboards.invalidate();

    return result;
  }

  @Get('overview')
  async overview() {
    return (await this.dashboards.dashboard('30d')).overview;
  }

  @Get('dashboard')
  dashboard(@Query() input: AdminDashboardQueryDto) {
    return this.dashboards.dashboard(input.period);
  }

  @Get('users')
  users(@Query() input: AdminUsersQueryDto) {
    return this.admin.users(input);
  }

  @Patch('users/:userId')
  async act(
    @Session() session: UserSession,
    @Param('userId') userId: string,
    @Body() input: AdminActionDto,
  ) {
    const result = await this.admin.act(session.user.id, userId, input.action);
    this.dashboards.invalidate();

    return result;
  }
}
