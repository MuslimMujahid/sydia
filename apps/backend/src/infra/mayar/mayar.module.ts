import { Module } from '@nestjs/common';
import { PAYMENT_GATEWAY } from './payment-gateway';
import { MayarGateway } from './mayar.gateway';

@Module({
  providers: [{ provide: PAYMENT_GATEWAY, useClass: MayarGateway }],
  exports: [PAYMENT_GATEWAY],
})
export class MayarModule {}
