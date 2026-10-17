import type { WorkspaceItem as PrismaWorkspaceItem } from '../../generated/prisma/client';
import type { RichTextDocument } from '../../shared/rich-text';

export type WorkspaceItem = Omit<PrismaWorkspaceItem, 'kind' | 'content'> & {
  kind: 'note' | 'folder';
  content: RichTextDocument;
};

export type WorkspaceCommit<T> = {
  writes: WorkspaceItem[];
  deletes: string[];
  result: T;
};

export type WorkspaceDailyDocument = {
  id: string;
  date: string;
  content: RichTextDocument;
  text: string;
  updatedAt: Date;
};
