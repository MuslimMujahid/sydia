import { Controller, Get, HttpStatus } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { GetUserService } from './services';

@Controller('users')
export class UsersController {
  constructor(private readonly getUser: GetUserService) {}

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
}
