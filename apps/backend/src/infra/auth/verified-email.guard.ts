import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { ApiException, ErrorCodes } from '../../shared/errors';

@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>('PUBLIC', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<Request>();
    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (session && !session.user.emailVerified) {
      throw new ApiException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Verifikasi email Anda sebelum melanjutkan.',
        details: { reason: 'EMAIL_VERIFICATION_REQUIRED' },
        status: HttpStatus.FORBIDDEN,
      });
    }

    return true;
  }
}
