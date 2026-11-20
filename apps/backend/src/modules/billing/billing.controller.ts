import { Body, Controller, Get, Header, Param, Post } from '@nestjs/common';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AllowInactiveBilling } from './billing-access.interceptor';
import { BillingService } from './billing.service';
import { BILLING_GIFT_BATCH_SIZE } from '../../shared/billing-policy';

export class CheckoutDto {
  @IsUUID() idempotencyKey!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/[\s()-]/g, '') : value,
  )
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/)
  mobile!: string;
}

class AcknowledgeGiftsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(BILLING_GIFT_BATCH_SIZE)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  giftIds!: string[];
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

  @Get('gifts')
  @Header('Cache-Control', 'private, no-store')
  gifts(@Session() session: UserSession) {
    return this.billing.pendingGifts(session.user.id);
  }

  @Post('gifts/acknowledge')
  acknowledgeGifts(
    @Session() session: UserSession,
    @Body() input: AcknowledgeGiftsDto,
  ) {
    return this.billing.acknowledgeGifts(session.user.id, input.giftIds);
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
