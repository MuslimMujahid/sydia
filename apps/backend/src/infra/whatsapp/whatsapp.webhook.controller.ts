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
import { WhatsAppGatewayService } from './whatsapp.gateway';
import type { GoWaWebhookEvent } from './whatsapp.types';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly gateway: WhatsAppGatewayService,
  ) {}

  @AllowAnonymous()
  @Post('webhook')
  @HttpCode(HttpStatus.NO_CONTENT)
  handleWebhook(
    @Req() req: RawBodyRequest,
    @Body() body: GoWaWebhookEvent,
  ): void {
    if (!this.verifySignature(req)) {
      this.logger.warn('Rejected WhatsApp webhook with invalid signature.');

      return;
    }

    this.gateway.handleWebhook(body);
  }

  private verifySignature(req: RawBodyRequest): boolean {
    const header = req.get('x-hub-signature-256') ?? '';
    const received = header.replace(/^sha256=/, '');
    const secret = this.config.get<string>(
      'BACKEND_WHATSAPP_WEBHOOK_SECRET',
      'dev-secret',
    );

    const raw = req.rawBody;

    if (!raw || received.length !== 64) return false;

    const expected = createHmac('sha256', secret).update(raw).digest();
    let receivedBuffer: Buffer;

    try {
      receivedBuffer = Buffer.from(received, 'hex');
    } catch {
      return false;
    }

    if (receivedBuffer.length !== expected.length) return false;

    return timingSafeEqual(expected, receivedBuffer);
  }
}
