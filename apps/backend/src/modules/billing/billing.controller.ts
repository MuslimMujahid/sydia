import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { IsString, IsUUID, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { AllowInactiveBilling } from './billing-access.interceptor';
import { BillingService } from './billing.service';

export class CheckoutDto {
  @IsUUID() idempotencyKey!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/[\s()-]/g, '') : value,
  )
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/)
  mobile!: string;
}

@AllowInactiveBilling()
@Roles(['user'])
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}
  @Get('me') status(@Session() session: UserSession) {
    return this.billing.status(session.user.id);
  }

  @Get('orders') orders(@Session() session: UserSession) {
    return this.billing.orders(session.user.id);
  }

  @Post('checkouts') checkout(
    @Session() session: UserSession,
    @Body() input: CheckoutDto,
  ) {
    return this.billing.checkout(session.user.id, input);
  }

  @Post('orders/:id/refresh') refresh(
    @Session() session: UserSession,
    @Param('id') id: string,
  ) {
    return this.billing.refresh(session.user.id, id);
  }
}
