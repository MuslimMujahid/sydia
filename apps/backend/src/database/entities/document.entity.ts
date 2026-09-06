import type {
  Document as PrismaDocument,
  DocumentChunk as PrismaDocumentChunk,
  FileAsset as PrismaFileAsset,
} from '../../generated/prisma/client';

export type FileKind = 'document' | 'image' | 'audio';
export type DocumentStatus = 'processing' | 'ready' | 'failed';

export type FileAsset = Pick<
  PrismaFileAsset,
  'id' | 'originalName' | 'mimeType' | 'size' | 'kind' | 'createdAt'
> & { kind: FileKind };

export type DocumentChunk = Pick<
  PrismaDocumentChunk,
  'id' | 'chunkIndex' | 'pageNumber' | 'content'
>;

export type Document = Pick<
  PrismaDocument,
  | 'id'
  | 'title'
  | 'textContent'
  | 'transcript'
  | 'imageDescription'
  | 'structuredData'
  | 'errorMessage'
  | 'createdAt'
  | 'updatedAt'
> & {
  status: DocumentStatus;
  file: FileAsset;
  chunks?: DocumentChunk[];
};

export type DocumentCreate = {
  fileAssetId: string;
  title: string;
};
