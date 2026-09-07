import { Global, Module } from '@nestjs/common';
import { PrismaWhatsAppRepository } from '../../database/repositories';
import { WHATSAPP_REPOSITORY } from '../../database/interfaces';
import { GoWhatsAppHttpClient } from './whatsapp.client';
import { WhatsAppWebhookController } from './whatsapp.webhook.controller';
import { WHATSAPP_CLIENT_FACTORY } from './whatsapp.types';
import { WhatsAppGatewayService } from './whatsapp.gateway';
import { PrismaModule } from '../prisma';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [WhatsAppWebhookController],
  providers: [
    {
      provide: WHATSAPP_REPOSITORY,
      useClass: PrismaWhatsAppRepository,
    },
    {
      provide: WHATSAPP_CLIENT_FACTORY,
      useValue: (options: {
        baseUrl: string;
        deviceId?: string;
        timeoutMs?: number;
      }) => new GoWhatsAppHttpClient(options),
    },
    WhatsAppGatewayService,
  ],
  exports: [WHATSAPP_REPOSITORY, WhatsAppGatewayService],
})
export class WhatsAppInfraModule {}
