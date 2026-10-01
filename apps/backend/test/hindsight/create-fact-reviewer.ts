import { ConfigService } from '@nestjs/config';
import { DecisionSettings } from '../../src/infra/decision-gateway';
import { DecisionCapacityService } from '../../src/infra/decision-gateway/decision-capacity.service';
import { TypeSafeDecisionGateway } from '../../src/infra/decision-gateway/typesafe-decision.gateway';
import { ObservabilityService } from '../../src/infra/observability';
import { MemoryFactDecisionService } from '../../src/modules/memories/memory-fact-decision.service';

/** Live synthetic contracts use the production Jev adapter without shared Redis capacity. */
export function createFactReviewer(): MemoryFactDecisionService {
  const config = new ConfigService({
    BACKEND_DECISION_API_KEY:
      process.env.BACKEND_DECISION_API_KEY?.trim() ||
      process.env.HINDSIGHT_POLICY_CONTRACT_KEY?.trim() ||
      process.env.BACKEND_MODEL_API_KEY,
    BACKEND_MEMORY_FACT_REVIEW_MODE: 'enabled',
    BACKEND_DECISION_COHORT: '*',
    BACKEND_DECISION_CALIBRATION_VERSION: 'synthetic-jev-only-v1',
    BACKEND_DECISION_BACKGROUND_TIMEOUT_MS: 30_000,
  });

  const gateway = new TypeSafeDecisionGateway(
    config,
    {
      reserve: () => Promise.resolve(() => Promise.resolve()),
    } as unknown as DecisionCapacityService,
    ObservabilityService.disabled(),
  );

  return new MemoryFactDecisionService(gateway, new DecisionSettings(config));
}
