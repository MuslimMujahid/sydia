import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import { WhatsAppConnectionsGateway } from './whatsapp-connections.gateway';
import type { GoWaWebhookEvent } from './whatsapp.types';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly gateway: WhatsAppConnectionsGateway,
  ) {}

  @AllowAnonymous()
  @Post('webhook')
  @HttpCode(HttpStatus.NO_CONTENT)
  async handleWebhook(
    @Req() req: RawBodyRequest,
    @Body() body: GoWaWebhookEvent,
  ): Promise<void> {
    if (!this.verifySignature(req)) {
      this.logger.warn('Rejected WhatsApp webhook with invalid signature.');

      return;
    }

    await this.gateway.handleWebhook(body);
  }

  private verifySignature(req: RawBodyRequest): boolean {
    const header = req.get('x-hub-signature-256') ?? '';
    const received = header.replace(/^sha256=/, '');
    const development =
      this.config.get<string>('NODE_ENV') === 'development' ||
      this.config.get<string>('NODE_ENV') === 'test';

    const secret = development
      ? this.config.get<string>('BACKEND_WHATSAPP_WEBHOOK_SECRET', 'dev-secret')
      : this.config.getOrThrow<string>('BACKEND_WHATSAPP_WEBHOOK_SECRET');

    const raw = req.rawBody;

    if (!raw || received.length !== 64) return false;

    const expected = createHmac('sha256', secret).update(raw).digest();
    if (!/^[a-f0-9]{64}$/i.test(received)) return false;
    const receivedBuffer = Buffer.from(received, 'hex');

    if (receivedBuffer.length !== expected.length) return false;

    return timingSafeEqual(expected, receivedBuffer);
  }
}
