import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import {
  type GenerationTrace,
  ObservabilityService,
} from './observability.service';

describe('ObservabilityService', () => {
  it('runs tracing unchanged without credentials or starting/exporting an SDK', async () => {
    const service = new ObservabilityService(new ConfigService());
    const operation = jest.fn((trace: GenerationTrace) => {
      trace.update({ output: 'ignored while disabled' });

      return Promise.resolve('operation-result');
    });

    await expect(
      service.traceGeneration(
        {
          provider: 'openrouter',
          model: 'test-model',
          messages: [{ role: 'user', content: 'Hello' }],
          userId: 'user-1',
          conversationId: 'conversation-1',
          runId: 'run-1',
          attempt: 1,
        },
        operation,
      ),
    ).resolves.toBe('operation-result');

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('makes cleanup safe when the SDK was never started', async () => {
    const service = new ObservabilityService(
      new ConfigService({ BACKEND_LANGFUSE_PUBLIC_KEY: 'public-only' }),
    );

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();

    expect(service).toBeInstanceOf(ObservabilityService);
  });
});
