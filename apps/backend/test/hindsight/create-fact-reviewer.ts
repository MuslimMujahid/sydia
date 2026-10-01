import { PrismaService } from '../../src/infra/prisma';
import {
  PrismaUserRepository,
  PrismaConversationRepository,
  PrismaHindsightRepository,
} from '../../src/database/repositories';
import type {
  IUserRepository,
  IConversationRepository,
  IHindsightRepository,
} from '../../src/database/interfaces';
import { ConfigService } from '@nestjs/config';
import { DecisionSettings } from '../../src/infra/decision-gateway';
import { DecisionCapacityService } from '../../src/infra/decision-gateway/decision-capacity.service';
import { TypeSafeDecisionGateway } from '../../src/infra/decision-gateway/typesafe-decision.gateway';
import { ObservabilityService } from '../../src/infra/observability';
import { MemoryFactDecisionService } from '../../src/modules/memories/memory-fact-decision.service';

/** Live synthetic contracts use the production Jev adapter without shared Redis capacity. */
export function createFactReviewer(
  prisma?: PrismaService,
): MemoryFactDecisionService {
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

  return new MemoryFactDecisionService(
    gateway,
    new DecisionSettings(config),
    prisma
      ? new PrismaUserRepository(prisma)
      : ({
          findById: () =>
            Promise.resolve({
              name: 'Synthetic User',
              preferredAddress: null,
              locale: 'en',
              timezone: 'UTC',
            }),
        } as unknown as IUserRepository),
    prisma
      ? new PrismaConversationRepository(prisma)
      : ({} as IConversationRepository),
    prisma
      ? new PrismaHindsightRepository(prisma)
      : ({} as IHindsightRepository),
  );
}
