import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { IsIn } from 'class-validator';
import type { AdminAction } from './admin.service';
import { AdminService } from './admin.service';
import { AdminUsersQueryDto } from './admin-users.dto';

const ADMIN_ACTIONS = ['ban', 'unban', 'force-sign-out', 'delete'] as const;

class AdminActionDto {
  @IsIn(ADMIN_ACTIONS)
  action!: AdminAction;
}

@Roles(['admin'])
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('users')
  users(@Query() input: AdminUsersQueryDto) {
    return this.admin.users(input);
  }

  @Patch('users/:userId')
  act(
    @Session() session: UserSession,
    @Param('userId') userId: string,
    @Body() input: AdminActionDto,
  ) {
    return this.admin.act(session.user.id, userId, input.action);
  }
}
