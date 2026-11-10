import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type {
  IModelUsageRepository,
  ModelUsageEntry,
} from '../../database/interfaces';
import { HindsightUsageService, keyUsage } from './hindsight-usage.service';
import {
  ModelUsageRecorder,
  normalizeStage,
  providerUsage,
} from './model-usage.recorder';
import { withModelUsageScope } from './model-usage.scope';

function repository(record = jest.fn<IModelUsageRepository['record']>()) {
  record.mockResolvedValue(undefined);

  return {
    record,
    recordCumulative: jest
      .fn<IModelUsageRepository['recordCumulative']>()
      .mockResolvedValue(0.5),
  };
}

async function recorded(
  recorder: ModelUsageRecorder,
  usage: ReturnType<typeof repository>,
): Promise<ModelUsageEntry> {
  await recorder.onModuleDestroy();

  return usage.record.mock.calls[0]![0];
}

describe('ModelUsageRecorder', () => {
  it('attributes a call to the enclosing message turn', async () => {
    const usage = repository();
    const recorder = new ModelUsageRecorder(usage);

    withModelUsageScope(
      { kind: 'message', userId: 'user-1', runId: 'run-1' },
      () =>
        recorder.record({
          stage: 'decision.turn',
          provider: 'openrouter',
          model: 'm',
          status: 'ok',
          costUsd: 0.002,
        }),
    );

    expect(await recorded(recorder, usage)).toEqual({
      userId: 'user-1',
      kind: 'message',
      job: null,
      stage: 'decision.turn',
      provider: 'openrouter',
      model: 'm',
      attempt: 1,
      status: 'ok',
      inputTokens: null,
      outputTokens: null,
      costUsd: 0.002,
      costMissing: false,
      conversationId: null,
      runId: 'run-1',
    });
  });

  it('keeps the job of a background scope when a user is added inside it', async () => {
    const usage = repository();
    const recorder = new ModelUsageRecorder(usage);

    await withModelUsageScope({ kind: 'background', job: 'secretary' }, () =>
      withModelUsageScope({ userId: 'user-2' }, async () => {
        await Promise.resolve();
        recorder.record({
          stage: 'embedding',
          provider: 'openrouter',
          model: 'e',
          status: 'ok',
        });
      }),
    );

    expect(await recorded(recorder, usage)).toMatchObject({
      kind: 'background',
      job: 'secretary',
      userId: 'user-2',
      // No reported cost is unknown, never zero.
      costUsd: null,
      costMissing: true,
    });
  });

  it('records a call outside any scope as other, preferring its own user', async () => {
    const usage = repository();
    const recorder = new ModelUsageRecorder(usage);

    withModelUsageScope({ userId: 'ignored' }, () =>
      recorder.record({
        stage: 'note-clarification.v1',
        provider: 'openrouter',
        model: 'm',
        status: 'failed',
        costUsd: 0.01,
        costPartial: true,
        userId: 'user-3',
      }),
    );

    expect(await recorded(recorder, usage)).toMatchObject({
      kind: 'other',
      userId: 'user-3',
      stage: 'note-clarification',
      status: 'failed',
      costUsd: 0.01,
      costMissing: true,
    });
  });

  it('logs a failed write instead of failing the model call', async () => {
    const usage = repository();
    usage.record.mockRejectedValue(new Error('database down'));
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const recorder = new ModelUsageRecorder(usage);

    expect(() =>
      recorder.record({
        stage: 'embedding',
        provider: 'openrouter',
        model: 'e',
        status: 'ok',
      }),
    ).not.toThrow();
    await recorder.onModuleDestroy();

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('admin cost totals will be low'),
      expect.stringContaining('database down'),
    );
    error.mockRestore();
  });
});

describe('normalizeStage', () => {
  it.each([
    ['note-organization.source.v1', 'note-organization.source'],
    ['memory-policy.evidence.sydia-admission-v1', 'memory-policy.evidence'],
    ['note-agent.background.v1', 'note-agent.background'],
    ['decision.turn', 'decision.turn'],
  ])('%s → %s', (stage, expected) => {
    expect(normalizeStage(stage)).toBe(expected);
  });
});

describe('providerUsage', () => {
  it('reads tokens and cost from an OpenAI-compatible usage object', () => {
    expect(
      providerUsage({
        usage: { prompt_tokens: 12, completion_tokens: 3, cost: 0.0001 },
      }),
    ).toEqual({ inputTokens: 12, outputTokens: 3, costUsd: 0.0001 });
  });

  it('leaves a missing or invalid cost unknown', () => {
    expect(providerUsage({ usage: { prompt_tokens: 4, cost: -1 } })).toEqual({
      inputTokens: 4,
    });
    expect(providerUsage({ data: [] })).toEqual({});
  });
});

describe('HindsightUsageService', () => {
  it('records the growth of the key usage as unattributed Hindsight spend', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { usage: 12.5, label: 'x' } })),
      );

    const usage = repository();
    const service = new HindsightUsageService(
      new ConfigService({ BACKEND_HINDSIGHT_OPENROUTER_API_KEY: 'hs-key' }),
      usage,
    );

    const now = new Date('2026-11-10T00:00:00Z');

    await expect(service.poll(now)).resolves.toBe(0.5);

    expect(fetch.mock.calls[0]![0]).toBe('https://openrouter.ai/api/v1/key');
    expect(fetch.mock.calls[0]![1]?.headers).toEqual({
      Authorization: 'Bearer hs-key',
    });
    expect(usage.recordCumulative).toHaveBeenCalledWith({
      source: 'openrouter-key:hindsight',
      totalUsd: 12.5,
      takenAt: now,
      entry: expect.objectContaining({ kind: 'hindsight', userId: null }),
    });
    fetch.mockRestore();
  });

  it('does nothing without a dedicated key', async () => {
    const usage = repository();
    const service = new HindsightUsageService(new ConfigService({}), usage);

    expect(service.configured).toBe(false);
    await expect(service.poll()).resolves.toBeNull();
    expect(usage.recordCumulative).not.toHaveBeenCalled();
  });

  it('fails visibly when the provider answers without a usage figure', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: {} })));

    const usage = repository();
    const service = new HindsightUsageService(
      new ConfigService({ BACKEND_HINDSIGHT_OPENROUTER_API_KEY: 'hs-key' }),
      usage,
    );

    await expect(service.poll()).rejects.toThrow('no numeric usage');
    expect(usage.recordCumulative).not.toHaveBeenCalled();
    expect(keyUsage({ data: { usage: '3' } })).toBeNull();
    fetch.mockRestore();
  });
});
