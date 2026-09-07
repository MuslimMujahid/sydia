import type { Memory as PrismaMemory } from '../../generated/prisma/client';

export const MEMORY_STATUSES = ['active', 'archived', 'superseded'] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export type Memory = Pick<
  PrismaMemory,
  | 'id'
  | 'content'
  | 'category'
  | 'pinned'
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
  sourceDocumentId?: string | null;
  confidence?: number | null;
  extractorVersion?: string | null;
  supersedesId?: string | null;
};
