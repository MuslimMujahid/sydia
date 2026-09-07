import { Global, Module } from '@nestjs/common';
import { createClient } from '@whatsmeow-node/whatsmeow-node';
import { PrismaWhatsAppRepository } from '../../database/repositories';
import { WHATSAPP_REPOSITORY } from '../../database/interfaces';
import { WHATSAPP_CLIENT_FACTORY } from './whatsapp.types';
import { WhatsAppGatewayService } from './whatsapp.gateway';
import { PrismaModule } from '../prisma';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: WHATSAPP_REPOSITORY,
      useClass: PrismaWhatsAppRepository,
    },
    {
      provide: WHATSAPP_CLIENT_FACTORY,
      useValue: (options: Parameters<typeof createClient>[0]) =>
        createClient(options),
    },
    WhatsAppGatewayService,
  ],
  exports: [WHATSAPP_REPOSITORY, WhatsAppGatewayService],
})
export class WhatsAppInfraModule {}
