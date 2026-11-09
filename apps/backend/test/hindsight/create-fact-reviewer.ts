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
import type {
  DecisionGateway,
  DecisionRequest,
  DecisionResult,
} from '../../src/infra/decision-gateway';

/**
 * The model live memory contracts run on: HINDSIGHT_POLICY_CONTRACT_MODEL,
 * else the configured production model, so a live failure reflects production
 * behaviour rather than a weaker stand-in.
 */
export const LIVE_POLICY_MODEL =
  process.env.HINDSIGHT_POLICY_CONTRACT_MODEL?.trim() ||
  process.env.BACKEND_MODEL_NAME?.trim() ||
  'qwen/qwen3.8-flash';

/** One Jev decision as a synthetic live report records it. */
export type RecordedDecision = {
  stage: string;
  state: unknown;
  status: DecisionResult['status'];
  reason?: string;
  answers?: Record<string, number | string>;
};

/** Live synthetic contracts use the production Jev adapter without shared Redis capacity. */
export function createFactReviewer(
  prisma?: PrismaService,
  record?: (decision: RecordedDecision) => void,
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

  const reviewed: DecisionGateway = record
    ? {
        decide: async (request: DecisionRequest) => {
          const result = await gateway.decide(request);

          record({
            stage: request.stage,
            state: JSON.parse(request.state) as unknown,
            status: result.status,
            ...(result.status === 'ok'
              ? {
                  answers: Object.fromEntries(
                    Object.entries(result.answers).map(([key, answer]) => [
                      key,
                      answer.type === 'noul' ? answer.noul : answer.choice,
                    ]),
                  ),
                }
              : { reason: result.reason }),
          });

          return result;
        },
      }
    : gateway;

  return new MemoryFactDecisionService(
    reviewed,
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
