import { Module } from '@nestjs/common';
import { HttpHindsightGateway } from './http-hindsight.gateway';
import { HINDSIGHT_GATEWAY } from './hindsight.types';

@Module({
  providers: [
    HttpHindsightGateway,
    { provide: HINDSIGHT_GATEWAY, useExisting: HttpHindsightGateway },
  ],
  exports: [HINDSIGHT_GATEWAY],
})
export class HindsightModule {}
