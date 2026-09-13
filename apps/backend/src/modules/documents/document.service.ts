import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Injectable } from '@nestjs/common';

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};
import {
  DOCUMENT_REPOSITORY,
  type IDocumentRepository,
} from '../../database/interfaces';
import { PDFParse } from 'pdf-parse';
import type {
  Document,
  DocumentChunk,
  DocumentMetadata,
  FileKind,
} from '../../database/entities';
import { EmbeddingsService } from '../../infra/embeddings';
import { OpenRouterMediaService } from '../../infra/model-gateway';
import { QueueService } from '../../infra/queue';
import { StorageService } from '../../infra/storage';

const CHUNK_SIZE = 1400;
const CHUNK_OVERLAP = 180;
const MIN_EXTRACTED_TEXT_LENGTH = 24;

/**
 * A failure that cannot succeed on retry: an unsupported format, no
 * extractable text, or missing configuration. The worker fails the job
 * immediately instead of spending the remaining attempts on it.
 */
export class NonRetryableDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableDocumentError';
  }
}

type ParsedChunk = {
  chunkIndex: number;
  pageNumber?: number | null;
  content: string;
};

function kindFor(mimeType: string): FileKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';

  return 'document';
}

export function chunkText(content: string): string[] {
  const normalized = content
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  if (!normalized) return [];
  const chunks: string[] = [];
  for (
    let start = 0;
    start < normalized.length;
    start += CHUNK_SIZE - CHUNK_OVERLAP
  )
    chunks.push(normalized.slice(start, start + CHUNK_SIZE));

  return chunks;
}

function diversifyByDocument<T extends { documentId: string }>(
  candidates: T[],
  limit: number,
  perDocument = 2,
): T[] {
  const selected: T[] = [];
  const counts = new Map<string, number>();

  for (const candidate of candidates) {
    const count = counts.get(candidate.documentId) ?? 0;
    if (count >= perDocument) continue;
    selected.push(candidate);
    counts.set(candidate.documentId, count + 1);
    if (selected.length === limit) break;
  }

  return selected;
}

function keywordScore(content: string, query: string): number {
  const normalized = content.toLocaleLowerCase();
  const terms = [
    ...new Set(
      query
        .toLocaleLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((term) => term.length > 2),
    ),
  ];

  if (terms.length === 0) return 0;

  return (
    terms.filter((term) => normalized.includes(term)).length / terms.length
  );
}

function fuseCandidates<T extends { id: string; content: string }>(
  semantic: T[],
  keyword: T[],
  query: string,
): T[] {
  const byId = new Map<string, { candidate: T; score: number }>();
  semantic.forEach((candidate, index) => {
    byId.set(candidate.id, {
      candidate,
      score: 1 / (60 + index + 1),
    });
  });
  [...keyword]
    .sort(
      (left, right) =>
        keywordScore(right.content, query) - keywordScore(left.content, query),
    )
    .forEach((candidate, index) => {
      const current = byId.get(candidate.id);
      const score = 1 / (60 + index + 1);
      byId.set(candidate.id, {
        candidate,
        score: score + (current?.score ?? 0),
      });
    });

  return [...byId.values()]
    .sort((left, right) => right.score - left.score)
    .map(({ candidate }) => candidate);
}

@Injectable()
export class DocumentService {
  constructor(
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documents: IDocumentRepository,
    private readonly storage: StorageService,
    private readonly embeddings: EmbeddingsService,
    private readonly media: OpenRouterMediaService,
    private readonly queue: QueueService,
  ) {}

  async ingest(userId: string, file: UploadedFile): Promise<Document> {
    const kind = kindFor(file.mimetype);
    const storageKey = `${userId}/${randomUUID()}`;
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    await this.storage.put(storageKey, file.buffer, file.mimetype);
    let document: Document;

    try {
      const asset = await this.documents.createFile(userId, {
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        checksum,
        storageKey,
        kind,
      });

      document = await this.documents.create(userId, {
        fileAssetId: asset.id,
        title: file.originalname,
      });
    } catch (error: unknown) {
      await this.storage.delete(storageKey).catch(() => {});
      throw error;
    }

    try {
      await this.queue.documents.add(
        'ingest',
        { documentId: document.id, userId },
        { jobId: document.id },
      );
    } catch (error: unknown) {
      await this.storage.delete(storageKey).catch(() => {});
      await this.documents.delete(userId, document.id).catch(() => {});
      throw error;
    }

    return document;
  }

  async waitUntilReady(
    userId: string,
    documentId: string,
    timeoutMs = 120_000,
  ): Promise<Document> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const document = await this.documents.findById(userId, documentId);
      if (!document) throw new Error('Dokumen tidak ditemukan.');
      if (document.status === 'ready') return document;
      if (document.status === 'failed')
        throw new Error(document.errorMessage ?? 'Pemrosesan dokumen gagal.');
      await sleep(500);
    }

    throw new Error('Pemrosesan dokumen melewati batas waktu.');
  }

  async processDocument(documentId: string, userId: string): Promise<void> {
    const record = await this.documents.findById(userId, documentId);
    if (!record || record.status !== 'processing') return;
    const storageKey = await this.documents.storageKey(userId, documentId);

    if (!storageKey)
      throw new NonRetryableDocumentError(
        'Berkas tidak ditemukan di penyimpanan.',
      );

    const buffer = await this.storage.get(storageKey);
    const file = {
      originalname: record.file.originalName,
      mimetype: record.file.mimeType,
      size: record.file.size,
      buffer,
    };

    const kind = record.file.kind;
    let textContent: string | null = null;
    let transcript: string | null = null;
    let parsedChunks: ParsedChunk[] = [];

    if (kind === 'audio') {
      // A retried job reuses the stored transcript instead of paying to
      // transcribe the same audio again; it is persisted before embedding.
      transcript =
        record.transcript?.trim() ||
        (await this.media.transcribe(
          file.buffer,
          file.originalname,
          file.mimetype,
        ));

      if (transcript && transcript !== record.transcript)
        await this.documents.saveExtraction(documentId, { transcript });

      parsedChunks = this.chunkPages([{ text: transcript ?? '' }]);
    } else if (kind === 'image') {
      throw new NonRetryableDocumentError(
        'Gambar tidak dapat diindeks tanpa pengenalan teks (OCR).',
      );
    } else if (file.mimetype === 'application/pdf') {
      const parsed = await this.parsePdf(file);
      textContent = parsed.text;
      parsedChunks = parsed.chunks;
    } else {
      textContent = this.parseDocument(file);
      parsedChunks = this.chunkPages([{ text: textContent }]);
    }

    if (parsedChunks.length === 0)
      throw new NonRetryableDocumentError(
        'Tidak ada isi yang dapat diindeks dari file ini.',
      );

    // Parsing is local and free, but re-embedding unchanged chunks is paid
    // again. Chunks that survived an earlier attempt are reused, and only the
    // ones still missing an embedding reach the embedding service.
    const existing = await this.documents.listChunkEmbeddings(documentId);
    const reusable =
      existing.length > 0 &&
      existing.length === parsedChunks.length &&
      existing.every(
        (chunk, index) =>
          chunk.chunkIndex === parsedChunks[index]?.chunkIndex &&
          chunk.content === parsedChunks[index]?.content,
      );

    const pending = parsedChunks
      .map((_chunk, index) => index)
      .filter((index) => !reusable || !existing[index]?.embedded);

    const embeddings = await Promise.all(
      pending.map((index) =>
        this.embeddings.embed(parsedChunks[index]!.content),
      ),
    );

    if (embeddings.some((embedding) => !embedding))
      throw new NonRetryableDocumentError(
        'Layanan embedding belum dikonfigurasi.',
      );

    // Chunks are published only after every required embedding succeeds.
    const chunks = reusable
      ? existing
      : await this.documents.replaceChunks(documentId, userId, parsedChunks);

    await Promise.all(
      pending.map((index, position) =>
        this.documents.setChunkEmbedding(
          chunks[index]!.id,
          embeddings[position]!,
          this.embeddings.modelName(),
          this.embeddings.version,
        ),
      ),
    );

    const searchable = textContent ?? transcript ?? '';
    await this.documents.complete(documentId, {
      textContent,
      transcript,
      structuredData: this.extractStructured(searchable),
    });
  }

  async markProcessingFailed(
    documentId: string,
    error: unknown,
  ): Promise<void> {
    const message =
      error instanceof Error ? error.message : 'Pemrosesan file gagal.';

    await this.documents.fail(documentId, message);
  }

  async retry(documentId: string, userId: string): Promise<Document | null> {
    const document = await this.documents.findById(userId, documentId);
    if (!document || document.status !== 'failed') return null;
    await this.documents.restart(documentId);

    try {
      await this.queue.documents.add(
        'ingest',
        { documentId, userId },
        { jobId: `${documentId}-retry-${randomUUID()}` },
      );
    } catch (error) {
      await this.markProcessingFailed(documentId, error);
      throw error;
    }

    return this.documents.findById(userId, documentId);
  }

  async listMetadata(userId: string): Promise<DocumentMetadata[]> {
    return this.documents.listMetadata(userId);
  }

  async listAttached(userId: string, messageId: string): Promise<Document[]> {
    return this.documents.findByMessageId(userId, messageId);
  }

  async loadFile(
    userId: string,
    documentId: string,
  ): Promise<{
    filename: string;
    mimeType: string;
    buffer: Buffer;
  } | null> {
    const document = await this.documents.findById(userId, documentId);
    if (!document) return null;
    const storageKey = await this.documents.storageKey(userId, documentId);
    if (!storageKey) return null;

    return {
      filename: document.file.originalName,
      mimeType: document.file.mimeType,
      buffer: await this.storage.get(storageKey),
    };
  }

  async listAttachedMetadata(
    userId: string,
    messageId: string,
  ): Promise<DocumentMetadata[]> {
    return this.documents.findMetadataByMessageId(userId, messageId);
  }

  async read(
    userId: string,
    documentId: string,
    cursor = 0,
    limit = 8,
  ): Promise<{
    document: DocumentMetadata;
    chunks: DocumentChunk[];
    nextCursor: number | null;
  } | null> {
    return this.documents.readChunks(userId, documentId, cursor, limit);
  }

  async searchForMessage(
    userId: string,
    messageId: string,
    query: string,
    limit = 6,
  ) {
    const attached = await this.documents.findByMessageId(userId, messageId);

    return this.search(
      userId,
      query,
      limit,
      attached.length ? attached.map(({ id }) => id) : undefined,
    );
  }

  async search(
    userId: string,
    query: string,
    limit = 6,
    documentIds?: string[],
  ) {
    const candidateLimit = Math.max(limit * 3, limit);
    const keyword = await this.documents.searchKeyword(
      userId,
      query,
      candidateLimit,
      documentIds,
    );

    try {
      const embedding = await this.embeddings.embed(query);
      if (!embedding) return diversifyByDocument(keyword, limit);
      const semantic = await this.documents.searchVector(
        userId,
        embedding,
        candidateLimit,
        documentIds,
      );

      const merged = fuseCandidates(semantic, keyword, query);

      return diversifyByDocument(merged, limit);
    } catch {
      return diversifyByDocument(keyword, limit);
    }
  }

  private chunkPages(
    pages: Array<{ text: string; pageNumber?: number }>,
  ): ParsedChunk[] {
    let chunkIndex = 0;

    return pages.flatMap(({ text, pageNumber }) =>
      chunkText(text).map((content) => ({
        chunkIndex: chunkIndex++,
        pageNumber: pageNumber ?? null,
        content,
      })),
    );
  }

  private async parsePdf(
    file: UploadedFile,
  ): Promise<{ text: string; chunks: ParsedChunk[] }> {
    const parser = new PDFParse({ data: file.buffer });

    try {
      const result = await parser.getText();
      const pages = result.pages.map((page) => ({
        pageNumber: page.num,
        text: page.text.trim(),
      }));

      const extractedLength = pages.reduce(
        (total, page) => total + page.text.length,
        0,
      );

      if (extractedLength < MIN_EXTRACTED_TEXT_LENGTH)
        throw new NonRetryableDocumentError(
          'PDF tidak berisi teks yang dapat diekstraksi.',
        );

      return {
        text: result.text,
        chunks: this.chunkPages(pages),
      };
    } finally {
      await parser.destroy();
    }
  }

  private parseDocument(file: UploadedFile): string {
    if (
      file.mimetype.startsWith('text/') ||
      file.mimetype === 'application/json'
    )
      return file.buffer.toString('utf8');
    throw new NonRetryableDocumentError(
      'Format dokumen belum didukung. Gunakan PDF, teks, atau JSON.',
    );
  }

  private extractStructured(content: string): Record<string, string> | null {
    const values: Record<string, string> = {};
    const email = content.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0];
    const amount = content.match(/(?:Rp\.?\s?|IDR\s?)[\d.,]+/i)?.[0];
    const date = content.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/)?.[0];
    if (email) values.email = email;
    if (amount) values.amount = amount;
    if (date) values.date = date;

    return Object.keys(values).length ? values : null;
  }
}
