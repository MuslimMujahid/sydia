import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../observability';
import { DecisionCapacityService } from './decision-capacity.service';
import { DecisionSettings } from './decision.config';
import { DECISION_GATEWAY } from './decision-gateway.types';
import { TypeSafeDecisionGateway } from './typesafe-decision.gateway';

@Module({
  imports: [ObservabilityModule],
  providers: [
    DecisionSettings,
    DecisionCapacityService,
    TypeSafeDecisionGateway,
    { provide: DECISION_GATEWAY, useExisting: TypeSafeDecisionGateway },
  ],
  exports: [DECISION_GATEWAY, DecisionSettings],
})
export class DecisionGatewayModule {}
