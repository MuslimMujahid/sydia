import { Body, Controller, Get, HttpStatus, Patch } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { GetUserService, UpdateUserProfileService } from './services';
import { UpdateUserPreferencesDto, UpdateUserProfileDto } from './dto';

@Controller('users')
export class UsersController {
  constructor(
    private readonly getUser: GetUserService,
    private readonly updateUserProfile: UpdateUserProfileService,
  ) {}

  @Get('me')
  async getMe(@Session() session: UserSession) {
    // The session proves authentication; the service confirms the identity
    // record still exists (a session can outlive the user row).
    const user = await this.getUser.byId(session.user.id);

    if (!user) {
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Authenticated user no longer exists',
        status: HttpStatus.NOT_FOUND,
      });
    }

    return user;
  }

  @Get('me/preferences')
  async getPreferences(@Session() session: UserSession) {
    const user = await this.getUser.byId(session.user.id);
    if (!user)
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Authenticated user no longer exists',
        status: HttpStatus.NOT_FOUND,
      });

    return {
      automaticMemoryEnabled: user.automaticMemoryEnabled,
      persona: user.persona,
    };
  }

  @Patch('me/preferences')
  async updatePreferences(
    @Session() session: UserSession,
    @Body() input: UpdateUserPreferencesDto,
  ) {
    const user = await this.updateUserProfile.execute(session.user.id, input);

    if (!user)
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Authenticated user no longer exists',
        status: HttpStatus.NOT_FOUND,
      });

    return {
      automaticMemoryEnabled: user.automaticMemoryEnabled,
      persona: user.persona,
    };
  }

  @Patch('me')
  async updateMe(
    @Session() session: UserSession,
    @Body() input: UpdateUserProfileDto,
  ) {
    const user = await this.updateUserProfile.execute(session.user.id, input);

    if (!user) {
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Authenticated user no longer exists',
        status: HttpStatus.NOT_FOUND,
      });
    }

    return user;
  }
}
