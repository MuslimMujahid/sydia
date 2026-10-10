import {
  metrics,
  type Counter,
  type Histogram,
  type Meter,
  type MeterProvider,
} from '@opentelemetry/api';
import type {
  CalendarSyncOperationalSnapshot,
  CalendarSyncRetentionResult,
} from '../../database/interfaces';
import type { GoogleCalendarRequestLane } from './google-calendar-request-limiter.service';

export type CalendarProviderMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST';
export type CalendarProviderRequestOutcome =
  'admission_deferred' | 'provider_error' | 'success' | 'transport_error';
export type CalendarSyncKind =
  'operation' | 'pull_page' | 'watch_renewal' | 'retention';
export type CalendarSyncOutcome =
  'conflict' | 'deferred' | 'failed' | 'lease_lost' | 'retry' | 'success';

const METER_NAME = 'sydia.calendar.sync';

type CalendarMetricInstruments = {
  providerRequests: Counter;
  providerRequestDuration: Histogram;
  admissionWait: Histogram;
  operationAge: Histogram;
  pullFreshness: Histogram;
  syncDuration: Histogram;
  syncJobs: Counter;
  pullPages: Counter;
  pullEvents: Counter;
  leaseLosses: Counter;
  refreshFailures: Counter;
  tokenRevocationFailures: Counter;
  watchRenewals: Counter;
  conflicts: Counter;
  exhaustedRetries: Counter;
  cleanupFailures: Counter;
  retentionRecords: Counter;
};

function elapsedMilliseconds(value: number): number {
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, value);
}

/**
 * Calendar metrics use only bounded operational attributes. Never add account,
 * event, binding, calendar, token, or user identifiers to these measurements.
 */
export class CalendarSyncMetrics {
  private currentProvider: MeterProvider | undefined;
  private activeInstruments: CalendarMetricInstruments | undefined;
  private operationalSnapshotReader:
    (() => Promise<CalendarSyncOperationalSnapshot>) | undefined;

  constructor(
    private readonly fixedMeter?: Meter,
    private readonly currentMeterProvider: () => MeterProvider = () =>
      metrics.getMeterProvider(),
  ) {}

  private get instruments(): CalendarMetricInstruments {
    if (this.fixedMeter) {
      this.activeInstruments ??= this.createInstruments(this.fixedMeter);

      return this.activeInstruments;
    }

    const provider = this.currentMeterProvider();

    if (provider !== this.currentProvider) {
      this.currentProvider = provider;
      this.activeInstruments = this.createInstruments(
        provider.getMeter(METER_NAME),
      );
    }

    if (!this.activeInstruments)
      throw new Error('Calendar sync metric instruments were not initialized.');

    return this.activeInstruments;
  }

  private createInstruments(meter: Meter): CalendarMetricInstruments {
    const providerRequests = meter.createCounter(
      'sydia.calendar.google.requests',
      {
        description:
          'Google Calendar API requests by method, lane, and result.',
      },
    );

    const providerRequestDuration = meter.createHistogram(
      'sydia.calendar.google.request.duration',
      { unit: 'ms', description: 'Google Calendar API request duration.' },
    );

    const admissionWait = meter.createHistogram(
      'sydia.calendar.google.admission.wait',
      {
        unit: 'ms',
        description: 'Time spent acquiring shared request capacity.',
      },
    );

    const operationAge = meter.createHistogram(
      'sydia.calendar.sync.operation.age',
      { unit: 'ms', description: 'Age of an outbound operation when claimed.' },
    );

    const pullFreshness = meter.createHistogram(
      'sydia.calendar.sync.pull.freshness',
      { unit: 'ms', description: 'Age of the last successful binding pull.' },
    );

    const syncDuration = meter.createHistogram('sydia.calendar.sync.duration', {
      unit: 'ms',
      description: 'Duration of a calendar sync work unit.',
    });

    const syncJobs = meter.createCounter('sydia.calendar.sync.jobs', {
      description: 'Calendar sync work unit outcomes.',
    });

    const pullPages = meter.createCounter('sydia.calendar.sync.pull.pages', {
      description: 'Successfully persisted Google Calendar pages.',
    });

    const pullEvents = meter.createCounter('sydia.calendar.sync.pull.events', {
      description: 'Events processed from Google Calendar pages.',
    });

    const leaseLosses = meter.createCounter(
      'sydia.calendar.sync.lease.losses',
      {
        description: 'Calendar sync writes fenced by lease ownership.',
      },
    );

    const refreshFailures = meter.createCounter(
      'sydia.calendar.sync.token_refresh.failures',
      { description: 'Calendar token refresh attempts that failed.' },
    );

    const tokenRevocationFailures = meter.createCounter(
      'sydia.calendar.sync.token_revocation.failures',
      { description: 'Google authorization revocation attempts that failed.' },
    );

    const watchRenewals = meter.createCounter(
      'sydia.calendar.sync.watch.renewals',
      { description: 'Calendar watch renewal outcomes.' },
    );

    const conflicts = meter.createCounter('sydia.calendar.sync.conflicts', {
      description: 'Calendar sync conflicts persisted.',
    });

    const exhaustedRetries = meter.createCounter(
      'sydia.calendar.sync.retry.exhausted',
      { description: 'Calendar operations that exhausted automatic retries.' },
    );

    const cleanupFailures = meter.createCounter(
      'sydia.calendar.sync.watch.cleanup.failures',
      { description: 'Remote Google Calendar watch stops that failed.' },
    );

    const retentionRecords = meter.createCounter(
      'sydia.calendar.sync.retention.records',
      {
        description:
          'Expired calendar records removed by bounded retention sweeps.',
      },
    );

    const pendingOperations = meter.createObservableGauge(
      'sydia.calendar.sync.operations.pending',
      { description: 'Durable outbound operations waiting to run.' },
    );

    const processingOperations = meter.createObservableGauge(
      'sydia.calendar.sync.operations.processing',
      { description: 'Durable outbound operations currently claimed.' },
    );

    const oldestOperationAge = meter.createObservableGauge(
      'sydia.calendar.sync.operation.oldest.age',
      { unit: 'ms', description: 'Age of the oldest active outbox operation.' },
    );

    const activeBindings = meter.createObservableGauge(
      'sydia.calendar.sync.bindings.active',
      { description: 'Connected active Google Calendar bindings.' },
    );

    const neverSyncedBindings = meter.createObservableGauge(
      'sydia.calendar.sync.bindings.never_synced',
      { description: 'Active bindings without a successful pull.' },
    );

    const oldestNeverSyncedBindingAge = meter.createObservableGauge(
      'sydia.calendar.sync.bindings.never_synced.oldest.age',
      {
        unit: 'ms',
        description:
          'Age of the oldest active binding without a successful pull.',
      },
    );

    const oldestPullAge = meter.createObservableGauge(
      'sydia.calendar.sync.pull.oldest.age',
      { unit: 'ms', description: 'Age of the stalest successful active pull.' },
    );

    const expiringWatches = meter.createObservableGauge(
      'sydia.calendar.sync.watch.expiring',
      { description: 'Active watch channels expiring within 24 hours.' },
    );

    const pendingWatchCleanup = meter.createObservableGauge(
      'sydia.calendar.sync.watch.cleanup.pending',
      {
        description:
          'Watch channels awaiting stop or automatic expiry after a failed stop.',
      },
    );

    const oldestWatchCleanupAge = meter.createObservableGauge(
      'sydia.calendar.sync.watch.cleanup.oldest.age',
      {
        unit: 'ms',
        description: 'Age of the oldest outstanding watch cleanup.',
      },
    );

    const operationalSnapshotFailures = meter.createCounter(
      'sydia.calendar.sync.operational_snapshot.failures',
      { description: 'Failed reads of database-backed calendar gauges.' },
    );

    meter.addBatchObservableCallback(
      async (result) => {
        const readSnapshot = this.operationalSnapshotReader;

        if (!readSnapshot) {
          operationalSnapshotFailures.add(1);
          throw new Error(
            'Calendar operational metrics reader was not registered.',
          );
        }

        try {
          const snapshot = await readSnapshot();
          result.observe(pendingOperations, snapshot.pendingOperationCount);
          result.observe(
            processingOperations,
            snapshot.processingOperationCount,
          );
          result.observe(oldestOperationAge, snapshot.oldestOperationAgeMs);
          result.observe(activeBindings, snapshot.activeBindingCount);
          result.observe(neverSyncedBindings, snapshot.neverSyncedBindingCount);
          result.observe(
            oldestNeverSyncedBindingAge,
            snapshot.oldestNeverSyncedBindingAgeMs,
          );
          result.observe(oldestPullAge, snapshot.oldestPullAgeMs);
          result.observe(expiringWatches, snapshot.expiringWatchCount);
          result.observe(
            pendingWatchCleanup,
            snapshot.pendingWatchCleanupCount,
          );
          result.observe(
            oldestWatchCleanupAge,
            snapshot.oldestWatchCleanupAgeMs,
          );
        } catch (error) {
          operationalSnapshotFailures.add(1);
          throw error;
        }
      },
      [
        pendingOperations,
        processingOperations,
        oldestOperationAge,
        activeBindings,
        neverSyncedBindings,
        oldestNeverSyncedBindingAge,
        oldestPullAge,
        expiringWatches,
        pendingWatchCleanup,
        oldestWatchCleanupAge,
      ],
    );

    return {
      providerRequests,
      providerRequestDuration,
      admissionWait,
      operationAge,
      pullFreshness,
      syncDuration,
      syncJobs,
      pullPages,
      pullEvents,
      leaseLosses,
      refreshFailures,
      tokenRevocationFailures,
      watchRenewals,
      conflicts,
      exhaustedRetries,
      cleanupFailures,
      retentionRecords,
    };
  }

  recordProviderRequest(
    method: CalendarProviderMethod,
    lane: GoogleCalendarRequestLane,
    outcome: CalendarProviderRequestOutcome,
    durationMs: number,
  ): void {
    const attributes = { method, lane, outcome };
    this.instruments.providerRequests.add(1, attributes);
    this.instruments.providerRequestDuration.record(
      elapsedMilliseconds(durationMs),
      attributes,
    );
  }

  recordAdmissionWait(
    lane: GoogleCalendarRequestLane,
    durationMs: number,
  ): void {
    this.instruments.admissionWait.record(elapsedMilliseconds(durationMs), {
      lane,
    });
  }

  recordOperationAge(
    kind: 'create' | 'delete' | 'update',
    ageMs: number,
  ): void {
    this.instruments.operationAge.record(elapsedMilliseconds(ageMs), { kind });
  }

  recordPullFreshness(
    mode: 'full_import' | 'incremental',
    ageMs: number,
  ): void {
    this.instruments.pullFreshness.record(elapsedMilliseconds(ageMs), { mode });
  }

  recordSyncWork(
    kind: CalendarSyncKind,
    outcome: CalendarSyncOutcome,
    durationMs: number,
  ): void {
    const attributes = { kind, outcome };
    this.instruments.syncJobs.add(1, attributes);
    this.instruments.syncDuration.record(
      elapsedMilliseconds(durationMs),
      attributes,
    );
  }

  recordPullPage(
    mode: 'full_import' | 'incremental',
    eventCount: number,
  ): void {
    const attributes = { mode };
    this.instruments.pullPages.add(1, attributes);
    this.instruments.pullEvents.add(
      Math.max(0, Math.floor(eventCount)),
      attributes,
    );
  }

  recordLeaseLoss(kind: 'binding' | 'operation'): void {
    this.instruments.leaseLosses.add(1, { kind });
  }

  recordRefreshFailure(): void {
    this.instruments.refreshFailures.add(1);
  }

  recordTokenRevocationFailure(): void {
    this.instruments.tokenRevocationFailures.add(1);
  }

  recordWatchRenewal(outcome: 'failed' | 'lease_lost' | 'success'): void {
    this.instruments.watchRenewals.add(1, { outcome });
  }

  recordConflict(): void {
    this.instruments.conflicts.add(1);
  }

  recordExhaustedRetry(): void {
    this.instruments.exhaustedRetries.add(1);
  }

  registerOperationalSnapshotReader(
    reader: () => Promise<CalendarSyncOperationalSnapshot>,
  ): void {
    this.operationalSnapshotReader = reader;
  }

  recordRetention(result: CalendarSyncRetentionResult): void {
    this.instruments.retentionRecords.add(result.ordinaryTombstones, {
      kind: 'ordinary_tombstone',
    });
    this.instruments.retentionRecords.add(result.completedOperations, {
      kind: 'completed_operation',
    });
    this.instruments.retentionRecords.add(result.expiredOAuthRequests, {
      kind: 'oauth_request',
    });
    this.instruments.retentionRecords.add(result.expiredMutationReceipts, {
      kind: 'mutation_receipt',
    });
  }

  recordCleanupFailure(count = 1): void {
    this.instruments.cleanupFailures.add(Math.max(0, Math.floor(count)));
  }
}

export const calendarSyncMetrics = new CalendarSyncMetrics();
