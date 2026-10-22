import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { BillingAccessService } from './billing-access.service';

const ALLOW_INACTIVE = 'billing.allow_inactive';
export const AllowInactiveBilling = () => SetMetadata(ALLOW_INACTIVE, true);

@Injectable()
export class BillingAccessInterceptor implements NestInterceptor {
  constructor(
    private readonly access: BillingAccessService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context
      .switchToHttp()
      .getRequest<
        Request & { user?: { id: string; locale?: string; role?: string } }
      >();

    const user = request.user;
    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_INACTIVE, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Auth is already enforced by Better Auth. Anonymous callbacks have their own
    // provider authentication; safe reads and deletion remain available on expiry.
    if (
      user &&
      user.role !== 'admin' &&
      !allowed &&
      !['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(request.method)
    ) {
      await this.access.assertActive(user.id, user.locale);
    }

    return next.handle();
  }
}
