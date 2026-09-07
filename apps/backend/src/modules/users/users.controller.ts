import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Patch,
  Res,
} from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { ApiException, ErrorCodes } from '../../shared/errors';
import {
  GetUserService,
  UpdateUserProfileService,
  UserPreferencesService,
  UserPrivacyService,
} from './services';
import { UpdateUserPreferencesDto, UpdateUserProfileDto } from './dto';

@Controller('users')
export class UsersController {
  constructor(
    private readonly getUser: GetUserService,
    private readonly updateUserProfile: UpdateUserProfileService,
    private readonly userPreferences: UserPreferencesService,
    private readonly privacy: UserPrivacyService,
  ) {}

  @Get('me')
  async getMe(@Session() session: UserSession) {
    const user = await this.getUser.byId(session.user.id);
    if (!user) throw this.notFound();

    return user;
  }

  @Get('me/preferences')
  async getPreferences(@Session() session: UserSession) {
    const user = await this.getUser.byId(session.user.id);
    if (!user) throw this.notFound();

    return this.userPreferences.get(user);
  }

  @Patch('me/preferences')
  async updatePreferences(
    @Session() session: UserSession,
    @Body() input: UpdateUserPreferencesDto,
  ) {
    const user = await this.getUser.byId(session.user.id);
    if (!user) throw this.notFound();
    const updated = await this.userPreferences.update(user, input, (profile) =>
      this.updateUserProfile.execute(session.user.id, profile),
    );

    if (!updated) throw this.notFound();

    return updated;
  }

  @Get('me/export')
  async export(
    @Session() session: UserSession,
    @Res({ passthrough: true }) response: Response,
  ) {
    const data = await this.privacy.export(session.user.id);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="sydia-export.json"',
    );

    return Buffer.from(JSON.stringify(data));
  }

  @Delete('me')
  deleteAccount(@Session() session: UserSession) {
    return this.privacy.deleteAccount(session.user.id);
  }

  @Patch('me')
  async updateMe(
    @Session() session: UserSession,
    @Body() input: UpdateUserProfileDto,
  ) {
    const user = await this.updateUserProfile.execute(session.user.id, input);
    if (!user) throw this.notFound();

    return user;
  }

  private notFound(): ApiException {
    return new ApiException({
      code: ErrorCodes.NOT_FOUND,
      message: 'Authenticated user no longer exists',
      status: HttpStatus.NOT_FOUND,
    });
  }
}
