import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { WhatsAppDeliveryQueues } from './whatsapp-delivery-queues';

@Global()
@Module({
  providers: [QueueService, WhatsAppDeliveryQueues],
  exports: [QueueService, WhatsAppDeliveryQueues],
})
export class QueueModule {}
