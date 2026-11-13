import { AdminAnalyticsService } from './admin-analytics.service';
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { IsIn } from 'class-validator';
import type { AdminAction } from './admin.service';
import { AdminService } from './admin.service';
import {
  AdminFeatureParamsDto,
  AdminPeriodQueryDto,
  AdminUsersQueryDto,
} from './admin-users.dto';
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
    private readonly analytics: AdminAnalyticsService,
  ) {}

  @Post('users/:userId/gift-plus')
  async giftPlus(
    @Session() session: UserSession,
    @Param('userId') userId: string,
    @Body() input: AdminGiftPlusDto,
  ) {
    const result = await this.gifts.gift(session.user.id, userId, input);
    this.analytics.invalidate();

    return result;
  }

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('summary')
  summary(@Query() input: AdminPeriodQueryDto) {
    return this.analytics.summary(input.period);
  }

  @Get('usage')
  usage(@Query() input: AdminPeriodQueryDto) {
    return this.analytics.usage(input.period);
  }

  @Get('usage/features/:feature')
  feature(
    @Param() params: AdminFeatureParamsDto,
    @Query() input: AdminPeriodQueryDto,
  ) {
    return this.analytics.feature(input.period, params.feature);
  }

  @Get('costs')
  costs(@Query() input: AdminPeriodQueryDto) {
    return this.analytics.costs(input.period);
  }

  @Get('users/:userId/insights')
  async userInsights(
    @Param('userId') userId: string,
    @Query() input: AdminPeriodQueryDto,
  ) {
    const insights = await this.analytics.userInsights(input.period, userId);

    if (!insights)
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Pengguna tidak ditemukan.',
        status: HttpStatus.NOT_FOUND,
      });

    return insights;
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
    this.analytics.invalidate();

    return result;
  }
}
