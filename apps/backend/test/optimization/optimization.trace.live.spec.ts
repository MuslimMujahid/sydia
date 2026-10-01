import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { ConfigService } from '@nestjs/config';
import { DecisionCapacityService } from '../../src/infra/decision-gateway/decision-capacity.service';
import { TypeSafeDecisionGateway } from '../../src/infra/decision-gateway/typesafe-decision.gateway';
import { ObservabilityService } from '../../src/infra/observability';

(process.env.OPTIMIZATION_TRACE_ENABLED === 'true' ? describe : describe.skip)(
  'Synthetic decision trace audit',
  () => {
    test('sends one redacted generation with actual model, tokens and cost', async () => {
      for (const key of [
        'BACKEND_MODEL_API_KEY',
        'BACKEND_REDIS_URL',
        'BACKEND_LANGFUSE_PUBLIC_KEY',
        'BACKEND_LANGFUSE_SECRET_KEY',
      ])
        if (!process.env[key]) throw new Error(`Trace audit requires ${key}`);
      const config = new ConfigService({
        ...process.env,
        BACKEND_DECISION_PROVIDER: 'openrouter',
        BACKEND_DECISION_MODEL: 'typesafe/jev-1.13',
        BACKEND_MEMORY_ELIGIBILITY_MODE: 'shadow',
      });

      const observability = new ObservabilityService(config);
      observability.onModuleInit();
      const capacity = new DecisionCapacityService(config);
      const gateway = new TypeSafeDecisionGateway(
        config,
        capacity,
        observability,
      );

      try {
        await sleep(500);
        const result = await gateway.decide({
          stage: 'contract-audit',
          environment: 'test',
          version: `synthetic-audit-${randomUUID()}`,
          lane: 'background',
          state: 'Synthetic user says hello.',
          questions: {
            greeting: { type: 'noul', instructions: 'Is this a greeting?' },
          },
        });

        expect(result.status).toBe('ok');

        if (result.status === 'ok') {
          expect(result.inputTokens).toBeGreaterThan(0);
          expect(result.costUsd).not.toBeNull();
        }
      } finally {
        capacity.onModuleDestroy();
        await observability.onModuleDestroy();
      }
    }, 30000);
  },
);
