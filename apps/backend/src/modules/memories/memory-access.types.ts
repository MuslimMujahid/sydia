export type MemorySearchHit = {
  id: string;
  content: string;
  evidence?: Array<{
    reference: string;
    content: string;
    sourceId: string;
    messageIds: string[];
    eventAt: string;
  }>;
  type?: 'world' | 'observation';
};

export type MemoryMutationReceipt = {
  engine: 'legacy' | 'hindsight';
  status: 'completed' | 'queued' | 'withdrawn';
  id: string;
  sourceIds?: string[];
  generation?: number;
  message: string;
};

export type MemoryWriteContext = {
  idempotencyKey: string;
  sourceMessageId?: string;
};
