import { Global, Module } from '@nestjs/common';
import { TelegramGatewayService } from './telegram.gateway';

@Global()
@Module({
  providers: [TelegramGatewayService],
  exports: [TelegramGatewayService],
})
export class TelegramInfraModule {}
