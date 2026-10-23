import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaWhatsAppConnectionRepository } from '../../database/repositories';
import { WHATSAPP_CONNECTION_REPOSITORY } from '../../database/interfaces';
import { GoWhatsAppHttpClient } from './whatsapp.client';
import { WhatsAppWebhookController } from './whatsapp.webhook.controller';
import {
  WhatsAppConnectionsGateway,
  WHATSAPP_CONNECTION_CLIENT_FACTORY,
} from './whatsapp-connections.gateway';
import { PrismaModule } from '../prisma';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [WhatsAppWebhookController],
  providers: [
    {
      provide: WHATSAPP_CONNECTION_REPOSITORY,
      useClass: PrismaWhatsAppConnectionRepository,
    },
    {
      provide: WHATSAPP_CONNECTION_CLIENT_FACTORY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => (deviceId: string) =>
        new GoWhatsAppHttpClient({
          baseUrl: config.getOrThrow<string>('BACKEND_WHATSAPP_GOWA_URL'),
          deviceId,
          timeoutMs: config.get<number>(
            'BACKEND_WHATSAPP_COMMAND_TIMEOUT',
            30_000,
          ),
        }),
    },
    WhatsAppConnectionsGateway,
  ],
  exports: [WHATSAPP_CONNECTION_REPOSITORY, WhatsAppConnectionsGateway],
})
export class WhatsAppInfraModule {}
