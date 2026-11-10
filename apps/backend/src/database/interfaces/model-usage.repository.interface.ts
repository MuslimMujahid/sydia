export type ModelUsageKind = 'message' | 'background' | 'hindsight' | 'other';

export type ModelUsageEntry = {
  userId: string | null;
  kind: ModelUsageKind;
  job: string | null;
  stage: string;
  provider: string;
  model: string;
  attempt: number;
  status: 'ok' | 'failed';
  inputTokens: number | null;
  outputTokens: number | null;
  /** Known billed cost; partial when `costMissing` is true. */
  costUsd: number | null;
  costMissing: boolean;
  conversationId: string | null;
  runId: string | null;
};

export interface IModelUsageRepository {
  record(entry: ModelUsageEntry): Promise<void>;
  /**
   * Records the spend an external source accrued since its last snapshot, given
   * its cumulative total now. The first reading only sets the baseline. Readings
   * are serialized per source, so concurrent pollers never count spend twice.
   * Returns the newly recorded spend.
   */
  recordCumulative(input: {
    source: string;
    totalUsd: number;
    takenAt: Date;
    entry: Omit<ModelUsageEntry, 'costUsd' | 'costMissing'>;
  }): Promise<number>;
}

export const MODEL_USAGE_REPOSITORY = Symbol('IModelUsageRepository');
