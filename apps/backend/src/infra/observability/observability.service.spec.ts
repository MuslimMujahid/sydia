import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type {
  GenerationTrace,
  ObservabilityService as ObservabilityServiceType,
} from './observability.service';

const generation = {
  update: jest.fn(),
  end: jest.fn(),
};

const startObservation = jest.fn(() => generation);
const propagateAttributes = jest.fn(
  async (
    _attributes: unknown,
    operation: () => Promise<unknown>,
  ): Promise<unknown> => operation(),
);

jest.unstable_mockModule('@langfuse/tracing', () => ({
  propagateAttributes,
  startObservation,
}));

let ObservabilityService: typeof ObservabilityServiceType;

beforeAll(async () => {
  // Import after unstable_mockModule so the ESM tracing seam is applied.
  ({ ObservabilityService } = await import('./observability.service.js'));
});

beforeEach(() => {
  startObservation.mockClear();
  generation.update.mockClear();
  generation.end.mockClear();
});

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

  it('captures generation input and successful output when tracing is enabled', async () => {
    const service = new ObservabilityService(
      new ConfigService({
        BACKEND_LANGFUSE_PUBLIC_KEY: 'public',
        BACKEND_LANGFUSE_SECRET_KEY: 'secret',
      }),
    );

    const messages = [{ role: 'user' as const, content: 'Hello' }];
    const operation = jest.fn((trace: GenerationTrace) => {
      trace.update({ output: 'Hello back' });

      return Promise.resolve('operation-result');
    });

    Reflect.set(ObservabilityService, 'started', true);

    try {
      await expect(
        service.traceGeneration(
          {
            provider: 'openrouter',
            model: 'test-model',
            messages,
            attempt: 1,
          },
          operation,
        ),
      ).resolves.toBe('operation-result');

      expect(startObservation).toHaveBeenCalledWith(
        'openrouter.generation',
        expect.objectContaining({
          input: messages,
          model: 'test-model',
        }),
        { asType: 'generation' },
      );
      expect(generation.update).toHaveBeenCalledWith({ output: 'Hello back' });
    } finally {
      Reflect.set(ObservabilityService, 'started', false);
    }
  });
});
