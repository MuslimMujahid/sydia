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

export type MemoryInput = {
  content: string;
  /** A hint for extraction only; Hindsight decides the stored shape. */
  category?: string | null;
};

export type MemoryMutationReceipt = {
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
