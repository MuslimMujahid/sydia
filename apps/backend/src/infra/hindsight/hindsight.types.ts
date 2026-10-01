export const HINDSIGHT_GATEWAY = Symbol('HindsightGateway');
export const HINDSIGHT_API_VERSION = '0.10.2';

export type HindsightFactType = 'world' | 'experience' | 'observation';
export type HindsightFact = {
  id: string;
  text: string;
  type: HindsightFactType;
  documentId: string | null;
  sourceFactIds: string[];
  metadata: Record<string, string>;
  occurredStart: string | null;
  mentionedAt: string | null;
};

export type HindsightRecall = {
  results: HindsightFact[];
  sourceFacts: Record<string, HindsightFact>;
  sourceFactsTruncated: boolean;
};

export type HindsightRetainInput = {
  documentId: string;
  content: string;
  timestamp: string;
  context?: string;
  metadata?: Record<string, string>;
  /** Persist before submission and reuse after a lost acknowledgement. */
  operationId: string;
};

export type HindsightOperationStatus =
  'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'not_found';

export type HindsightOperation = {
  id: string;
  status: HindsightOperationStatus;
};

export type HindsightFactPage = {
  items: HindsightFact[];
  total: number;
};

export type HindsightRecallInput = {
  query: string;
  timestamp: string;
  maxTokens: number;
  budget?: 'low' | 'mid' | 'high';
  includeObservations?: boolean;
};

export interface HindsightGateway {
  version(): Promise<string>;
  ready(): Promise<void>;
  configureBank(bankId: string, retainMission: string): Promise<void>;
  retain(
    bankId: string,
    input: HindsightRetainInput,
  ): Promise<HindsightOperation>;
  operation(bankId: string, operationId: string): Promise<HindsightOperation>;
  recall(bankId: string, input: HindsightRecallInput): Promise<HindsightRecall>;
  listFacts(
    bankId: string,
    documentId: string,
    offset?: number,
  ): Promise<HindsightFactPage>;
  correctFact(bankId: string, factId: string, text: string): Promise<void>;
  deleteDocument(bankId: string, documentId: string): Promise<void>;
  deleteBank(bankId: string): Promise<void>;
}

export class HindsightError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'HindsightError';
  }
}
