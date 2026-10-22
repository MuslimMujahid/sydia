import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  BILLING_REPOSITORY,
  type IBillingRepository,
} from '../../database/interfaces';
import { ApiException, ErrorCodes } from '../../shared/errors';

@AllowAnonymous()
@Controller('webhooks/billing/mayar')
export class BillingWebhookController {
  private readonly logger = new Logger(BillingWebhookController.name);
  constructor(
    private readonly config: ConfigService,
    @Inject(BILLING_REPOSITORY) private readonly repository: IBillingRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Headers('x-callback-token') token: string | undefined,
    @Body() body: unknown,
  ) {
    const secret = this.config.get<string>('MAYAR_WEBHOOK_TOKEN');

    if (
      !secret ||
      !token ||
      token.length > 512 ||
      !timingSafeEqual(
        createHash('sha256').update(token).digest(),
        createHash('sha256').update(secret).digest(),
      )
    ) {
      this.logger.warn('billing.webhook_authentication_failed');
      throw new ApiException({
        code: ErrorCodes.FORBIDDEN,
        status: HttpStatus.UNAUTHORIZED,
        message: 'Invalid callback token',
      });
    }

    if (
      !body ||
      typeof body !== 'object' ||
      !('event' in body) ||
      typeof body.event !== 'string' ||
      body.event.length > 100
    )
      throw new ApiException({
        code: ErrorCodes.BAD_REQUEST,
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid billing event',
      });
    if (body.event !== 'payment.received')
      return { received: true, ignored: true };
    const data =
      'data' in body && body.data && typeof body.data === 'object'
        ? (body.data as Record<string, unknown>)
        : undefined;

    const identifier = (value: unknown) =>
      typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
        ? value
        : null;

    const transactionId = identifier(data?.transactionId);
    const invoiceId = identifier(data?.productId);
    if (!transactionId)
      throw new ApiException({
        code: ErrorCodes.BAD_REQUEST,
        status: HttpStatus.BAD_REQUEST,
        message: 'Payment event is missing a transaction identifier',
      });
    const environment = this.config.getOrThrow<string>('MAYAR_ENVIRONMENT');
    const id = createHash('sha256')
      .update(JSON.stringify([environment, body.event, transactionId]))
      .digest('hex');

    // Persist only routing hints, never customer names, emails, phone numbers or
    // the raw event. Worker sweeps recover even if Redis is down at receipt time.
    await this.repository.receiveWebhook({
      id,
      environment,
      event: body.event,
      transactionId,
      invoiceId,
    });

    return { received: true };
  }
}
