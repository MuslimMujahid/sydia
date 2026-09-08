import type { Memory as PrismaMemory } from '../../generated/prisma/client';

export const MEMORY_STATUSES = ['active', 'superseded'] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export type Memory = Pick<
  PrismaMemory,
  | 'id'
  | 'content'
  | 'category'
  | 'pinned'
  | 'sourceMessageIds'
  | 'supersedesId'
  | 'supersededById'
  | 'createdAt'
  | 'updatedAt'
> & {
  status: MemoryStatus;
  source: {
    type: 'dashboard' | 'chat' | 'whatsapp' | 'document' | 'automatic';
    label: string | null;
    messageId: string | null;
    documentId: string | null;
  };
};

export type MemoryWrite = {
  content: string;
  category?: string | null;
  status?: MemoryStatus;
  pinned?: boolean;
  sourceType?: 'dashboard' | 'chat' | 'whatsapp' | 'document' | 'automatic';
  sourceMessageId?: string | null;
  sourceMessageIds?: string[];
  sourceDocumentId?: string | null;
  confidence?: number | null;
  extractorVersion?: string | null;
  supersedesId?: string | null;
  dreamRunId?: string | null;
  sourceKey?: string | null;
};

export type MemoryDreamSegment = {
  userId: string;
  conversationId: string;
  previousThroughMessageId: string | null;
  throughMessageId: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: Date;
  }>;
};

export type MemoryDreamRun = {
  id: string;
  userId: string;
  conversationId: string;
  throughMessageId: string;
  dreamerVersion: string;
  status: string;
};
