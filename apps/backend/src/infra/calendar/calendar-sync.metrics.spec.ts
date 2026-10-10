import { describe, expect, it } from '@jest/globals';
import type {
  Attributes,
  BatchObservableCallback,
  BatchObservableResult,
  Meter,
  MeterProvider,
  Observable,
} from '@opentelemetry/api';
import { CalendarSyncMetrics } from './calendar-sync.metrics';

function observableMeterHarness() {
  const counterRecords: Array<{ name: string; value: number }> = [];
  const observableNames = new WeakMap<object, string>();
  let batchCallback: BatchObservableCallback | undefined;
  const meter = {
    createCounter: (name: string) => ({
      add: (value: number) => counterRecords.push({ name, value }),
    }),
    createHistogram: () => ({ record: () => undefined }),
    createObservableGauge: (name: string) => {
      const observable = {
        addCallback: () => undefined,
        removeCallback: () => undefined,
      };

      observableNames.set(observable, name);

      return observable;
    },
    addBatchObservableCallback: (callback: BatchObservableCallback) => {
      batchCallback = callback;
    },
  } as unknown as Meter;

  return {
    counterRecords,
    meter,
    async collect() {
      if (!batchCallback)
        throw new Error('The operational metrics callback was not registered.');

      const observations: Array<{ name: string; value: number }> = [];
      const result = {
        observe: (observable: Observable, value: number) => {
          const name = observableNames.get(observable);
          if (!name)
            throw new Error('An unregistered observable was measured.');
          observations.push({ name, value });
        },
      } as unknown as BatchObservableResult;

      await batchCallback(result);

      return observations;
    },
  };
}

describe('CalendarSyncMetrics', () => {
  it('retention reports bounded record kinds without event or tenant labels', () => {
    const records: Array<{ value: number; attributes?: Attributes }> = [];
    const meter = {
      createCounter: (name: string) => ({
        add: (value: number, attributes?: Attributes) => {
          if (name === 'sydia.calendar.sync.retention.records')
            records.push({ value, attributes });
        },
      }),
      createHistogram: () => ({ record: () => undefined }),
      createObservableGauge: () => ({}),
      addBatchObservableCallback: () => undefined,
    } as unknown as Meter;

    const telemetry = new CalendarSyncMetrics(meter);
    telemetry.recordRetention({
      ordinaryTombstones: 5,
      completedOperations: 2,
      expiredOAuthRequests: 3,
      expiredMutationReceipts: 4,
    });
    expect(records).toEqual([
      { value: 5, attributes: { kind: 'ordinary_tombstone' } },
      { value: 2, attributes: { kind: 'completed_operation' } },
      { value: 3, attributes: { kind: 'oauth_request' } },
      { value: 4, attributes: { kind: 'mutation_receipt' } },
    ]);
  });

  it('records provider calls with bounded method, lane, and outcome attributes', () => {
    const counterRecords: Array<{
      name: string;
      value: number;
      attributes?: Attributes;
    }> = [];

    const histogramRecords: Array<{
      name: string;
      value: number;
      attributes?: Attributes;
    }> = [];

    const meter = {
      createCounter: (name: string) => ({
        add: (value: number, attributes?: Attributes) => {
          counterRecords.push({ name, value, attributes });
        },
      }),
      createHistogram: (name: string) => ({
        record: (value: number, attributes?: Attributes) => {
          histogramRecords.push({ name, value, attributes });
        },
      }),
      createObservableGauge: () => ({
        addCallback: () => undefined,
        removeCallback: () => undefined,
      }),
      addBatchObservableCallback: () => undefined,
    } as unknown as Meter;

    const telemetry = new CalendarSyncMetrics(meter);

    telemetry.recordProviderRequest('PATCH', 'outbound', 'success', 23);
    telemetry.recordTokenRevocationFailure();

    expect(counterRecords).toContainEqual({
      name: 'sydia.calendar.google.requests',
      value: 1,
      attributes: {
        method: 'PATCH',
        lane: 'outbound',
        outcome: 'success',
      },
    });
    expect(counterRecords).toContainEqual({
      name: 'sydia.calendar.sync.token_revocation.failures',
      value: 1,
      attributes: undefined,
    });
    expect(histogramRecords).toContainEqual({
      name: 'sydia.calendar.google.request.duration',
      value: 23,
      attributes: {
        method: 'PATCH',
        lane: 'outbound',
        outcome: 'success',
      },
    });
  });

  it('keeps negative durations and pull event counts from producing invalid samples', () => {
    const histogramRecords: Array<{ name: string; value: number }> = [];
    const counterRecords: Array<{ name: string; value: number }> = [];
    const meter = {
      createCounter: (name: string) => ({
        add: (value: number) => counterRecords.push({ name, value }),
      }),
      createHistogram: (name: string) => ({
        record: (value: number) => histogramRecords.push({ name, value }),
      }),
      createObservableGauge: () => ({
        addCallback: () => undefined,
        removeCallback: () => undefined,
      }),
      addBatchObservableCallback: () => undefined,
    } as unknown as Meter;

    const telemetry = new CalendarSyncMetrics(meter);

    telemetry.recordAdmissionWait('pull', -1);
    telemetry.recordPullPage('incremental', -4);

    expect(histogramRecords).toContainEqual({
      name: 'sydia.calendar.google.admission.wait',
      value: 0,
    });
    expect(counterRecords).toContainEqual({
      name: 'sydia.calendar.sync.pull.events',
      value: 0,
    });
  });

  it('rebinds instruments when the OpenTelemetry SDK starts after module load', () => {
    const noopMeter = {
      createCounter: () => ({ add: () => undefined }),
      createHistogram: () => ({ record: () => undefined }),
      createObservableGauge: () => ({
        addCallback: () => undefined,
        removeCallback: () => undefined,
      }),
      addBatchObservableCallback: () => undefined,
    } as unknown as Meter;

    const activeCounterRecords: Array<{ name: string; value: number }> = [];
    const activeMeter = {
      createCounter: (name: string) => ({
        add: (value: number) => activeCounterRecords.push({ name, value }),
      }),
      createHistogram: () => ({ record: () => undefined }),
      createObservableGauge: () => ({
        addCallback: () => undefined,
        removeCallback: () => undefined,
      }),
      addBatchObservableCallback: () => undefined,
    } as unknown as Meter;

    const noopProvider = {
      getMeter: () => noopMeter,
    } as unknown as MeterProvider;

    const activeProvider = {
      getMeter: () => activeMeter,
    } as unknown as MeterProvider;

    let provider = noopProvider;
    const telemetry = new CalendarSyncMetrics(undefined, () => provider);

    telemetry.recordProviderRequest('GET', 'pull', 'success', 1);
    provider = activeProvider;
    telemetry.recordProviderRequest('GET', 'pull', 'success', 1);

    expect(activeCounterRecords).toContainEqual({
      name: 'sydia.calendar.google.requests',
      value: 1,
    });
  });

  it('exports database-backed operational gauges from one bounded snapshot', async () => {
    const harness = observableMeterHarness();
    const telemetry = new CalendarSyncMetrics(harness.meter);
    let snapshotReads = 0;
    telemetry.registerOperationalSnapshotReader(() => {
      snapshotReads += 1;

      return Promise.resolve({
        pendingOperationCount: 4,
        processingOperationCount: 2,
        oldestOperationAgeMs: 30_000,
        activeBindingCount: 5,
        neverSyncedBindingCount: 1,
        oldestNeverSyncedBindingAgeMs: 75_000,
        oldestPullAgeMs: 60_000,
        expiringWatchCount: 3,
        pendingWatchCleanupCount: 2,
        oldestWatchCleanupAgeMs: 90_000,
      });
    });
    telemetry.recordProviderRequest('GET', 'pull', 'success', 1);

    const observations = await harness.collect();

    expect(snapshotReads).toBe(1);
    expect(observations).toEqual([
      { name: 'sydia.calendar.sync.operations.pending', value: 4 },
      { name: 'sydia.calendar.sync.operations.processing', value: 2 },
      { name: 'sydia.calendar.sync.operation.oldest.age', value: 30_000 },
      { name: 'sydia.calendar.sync.bindings.active', value: 5 },
      { name: 'sydia.calendar.sync.bindings.never_synced', value: 1 },
      {
        name: 'sydia.calendar.sync.bindings.never_synced.oldest.age',
        value: 75_000,
      },
      { name: 'sydia.calendar.sync.pull.oldest.age', value: 60_000 },
      { name: 'sydia.calendar.sync.watch.expiring', value: 3 },
      { name: 'sydia.calendar.sync.watch.cleanup.pending', value: 2 },
      { name: 'sydia.calendar.sync.watch.cleanup.oldest.age', value: 90_000 },
    ]);
  });

  it('counts a failed database snapshot and rethrows the collection error', async () => {
    const harness = observableMeterHarness();
    const telemetry = new CalendarSyncMetrics(harness.meter);
    telemetry.registerOperationalSnapshotReader(() =>
      Promise.reject(new Error('synthetic metrics database failure')),
    );
    telemetry.recordProviderRequest('GET', 'pull', 'success', 1);

    await expect(harness.collect()).rejects.toThrow(
      'synthetic metrics database failure',
    );
    expect(harness.counterRecords).toContainEqual({
      name: 'sydia.calendar.sync.operational_snapshot.failures',
      value: 1,
    });
  });
});
