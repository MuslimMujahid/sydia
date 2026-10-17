import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileLibraryService } from './file-library.service';

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
import type {
  Document,
  DocumentChunk,
  DocumentMetadata,
  DocumentUpdate,
  FileKind,
} from '../../database/entities';
import { FileLibraryError } from '../../database/entities';
import { EmbeddingsService } from '../../infra/embeddings';
import {
  LANGUAGE_MODEL,
  type LanguageModelGateway,
  OpenRouterMediaService,
} from '../../infra/model-gateway';
import { QueueService } from '../../infra/queue';
import { StorageReadLimitError, StorageService } from '../../infra/storage';
import { chunkText } from '../../shared/text';
import { sanitizeDerivedTitle } from './document-naming';
import { DocumentExtractionService } from './document-extraction.service';
import { documentParserFailureMessage } from './document-parser-errors';
import {
  assertDocumentUploadMetadata,
  DocumentParserError,
  MAX_DOCUMENT_BYTES,
} from '../../infra/document-parser';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { DocumentProcessingPendingError } from '../../shared/documents';
import { DocumentArtifactCleanupService } from '../document-artifacts/document-artifact-cleanup.service';
import { HttpStatus } from '@nestjs/common';

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

const NO_ARTIFACT_CLEANUP: Pick<
  DocumentArtifactCleanupService,
  'trackUpload' | 'startUploadLease' | 'requestCleanup' | 'activateUpload'
> = {
  trackUpload: () => Promise.resolve(),
  startUploadLease: () => () => undefined,
  requestCleanup: () => Promise.resolve(),
  activateUpload: () => Promise.resolve(),
};

function kindFor(mimeType: string): FileKind {
  mimeType = (mimeType.split(';')[0] ?? '').trim().toLowerCase();
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';

  return 'document';
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
  private readonly logger = new Logger(DocumentService.name);
  private readonly publicBaseUrl: string;

  constructor(
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documents: IDocumentRepository,
    private readonly storage: StorageService,
    private readonly embeddings: EmbeddingsService,
    private readonly media: OpenRouterMediaService,
    private readonly queue: QueueService,
    @Inject(LANGUAGE_MODEL)
    private readonly languageModel: LanguageModelGateway,
    private readonly config: ConfigService,
    private readonly extraction: DocumentExtractionService,
    @Inject(DocumentArtifactCleanupService)
    private readonly artifactCleanup: Pick<
      DocumentArtifactCleanupService,
      'trackUpload' | 'startUploadLease' | 'requestCleanup' | 'activateUpload'
    > = NO_ARTIFACT_CLEANUP,
    private readonly library?: FileLibraryService,
  ) {
    this.publicBaseUrl = config.getOrThrow<string>('BACKEND_AUTH_URL');
  }

  async ingest(
    userId: string,
    file: UploadedFile,
    options?: { hint?: string; folderId?: string },
  ): Promise<Document> {
    if (
      file.buffer.length > MAX_DOCUMENT_BYTES ||
      file.size > MAX_DOCUMENT_BYTES
    )
      throw new ApiException({
        code: ErrorCodes.BAD_REQUEST,
        message: 'Ukuran file maksimal 25 MiB.',
        status: HttpStatus.BAD_REQUEST,
      });

    try {
      assertDocumentUploadMetadata(file);
    } catch (error: unknown) {
      if (!(error instanceof DocumentParserError)) throw error;
      const message = documentParserFailureMessage(error.code);
      const failure = new ApiException({
        code: ErrorCodes.BAD_REQUEST,
        status: HttpStatus.BAD_REQUEST,
        message,
        details: { parserCode: error.code },
      });

      // Messaging gateways use Error.message instead of the HTTP envelope.
      failure.message = message;
      failure.cause = error;
      throw failure;
    }

    if (options?.folderId) {
      if (!this.library)
        throw new Error(
          'File library provider is required for folder uploads.',
        );
      await this.library.execute(() =>
        this.library!.repository.assertUploadDestination(
          userId,
          options.folderId!,
        ),
      );
    }

    const kind = kindFor(file.mimetype);
    const storageKey = `${userId}/${randomUUID()}`;
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    await this.artifactCleanup.trackUpload(userId, storageKey);
    const stopUploadLease = this.artifactCleanup.startUploadLease(storageKey);

    try {
      await this.storage.put(storageKey, file.buffer, file.mimetype);
      let document = await this.documents.createWithFile(userId, {
        file: {
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          checksum,
          storageKey,
          kind,
        },
        title: file.originalname,
        ...(options?.folderId ? { folderId: options.folderId } : {}),
      });

      if (kind !== 'document')
        document = await this.applyDerivedTitle(
          userId,
          document,
          file,
          kind,
          options?.hint,
        );

      await this.queue.documents.add(
        'ingest',
        {
          documentId: document.id,
          userId,
          ...(options?.hint ? { hint: options.hint.slice(0, 4000) } : {}),
        },
        { jobId: document.id },
      );
      await this.artifactCleanup.activateUpload(storageKey);

      return document;
    } catch (error: unknown) {
      this.logger.error(
        'Document upload failed; cleaning up uploaded artifacts.',
        error,
      );
      const cleanupErrors: unknown[] = [];

      await this.artifactCleanup
        .requestCleanup(userId, storageKey)
        .catch((cleanupError: unknown) => cleanupErrors.push(cleanupError));

      // The unique key also identifies a write whose acknowledgement was lost.
      // Remove the record first so late workers clean up their own checkpoints.
      await this.documents
        .deleteFileByStorageKey(userId, storageKey)
        .catch((cleanupError: unknown) => cleanupErrors.push(cleanupError));
      const artifacts = await Promise.allSettled([
        this.storage.delete(storageKey),
        this.extraction.deleteCheckpoint(storageKey),
      ]);

      for (const result of artifacts)
        if (result.status === 'rejected') cleanupErrors.push(result.reason);

      if (cleanupErrors.length) {
        const message =
          'Unggahan gagal dan pembersihan file belum selesai. Hubungi administrator.';

        const failure = new ApiException({
          code: ErrorCodes.SERVICE_UNAVAILABLE,
          status: HttpStatus.SERVICE_UNAVAILABLE,
          message,
          details: { cleanupIncomplete: true },
        });

        failure.message = message;
        failure.cause = new AggregateError([error, ...cleanupErrors]);
        throw failure;
      }

      if (error instanceof FileLibraryError && this.library)
        return this.library.execute(() => Promise.reject(error));
      throw error;
    } finally {
      stopUploadLease();
    }
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

    // Recheck the state at the deadline before reporting background processing.
    const current = await this.documents.findById(userId, documentId);
    if (!current) throw new Error('Dokumen tidak ditemukan.');
    if (current.status === 'ready') return current;
    if (current.status === 'failed')
      throw new Error(current.errorMessage ?? 'Pemrosesan dokumen gagal.');
    throw new DocumentProcessingPendingError(documentId);
  }

  async processDocument(
    documentId: string,
    userId: string,
    hint?: string,
  ): Promise<void> {
    const record = await this.documents.findById(userId, documentId);
    if (!record || record.status !== 'processing') return;
    const storageKey = await this.documents.storageKey(userId, documentId);

    if (!storageKey)
      throw new NonRetryableDocumentError(
        'Berkas tidak ditemukan di penyimpanan.',
      );

    try {
      await this.processStoredDocument(record, userId, storageKey, hint);
    } finally {
      // Deletion can race with extraction or a later failed embedding call.
      // Keep checkpoints for surviving records so their retries can reuse them.
      if (!(await this.documents.findById(userId, documentId)))
        await this.extraction.deleteCheckpoint(storageKey);
    }
  }

  private async processStoredDocument(
    record: Document,
    userId: string,
    storageKey: string,
    hint?: string,
  ): Promise<void> {
    const documentId = record.id;
    const buffer = await this.storage
      .get(storageKey, MAX_DOCUMENT_BYTES)
      .catch((error: unknown) => {
        if (error instanceof StorageReadLimitError)
          throw new NonRetryableDocumentError(
            documentParserFailureMessage('FILE_TOO_LARGE'),
          );
        throw error;
      });

    const file = {
      originalname: record.file.originalName,
      mimetype: record.file.mimeType,
      size: record.file.size,
      buffer,
    };

    try {
      assertDocumentUploadMetadata(file);
    } catch (error: unknown) {
      if (error instanceof DocumentParserError)
        throw new NonRetryableDocumentError(
          documentParserFailureMessage(error.code),
        );
      throw error;
    }

    const kind = record.file.kind;
    let textContent: string | null = null;
    let transcript: string | null = null;
    let imageDescription: string | null = null;
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
      imageDescription =
        record.imageDescription?.trim() ||
        (await this.media.describeImage(file.buffer, file.mimetype));
      if (imageDescription && imageDescription !== record.imageDescription)
        await this.documents.saveExtraction(documentId, { imageDescription });
      const descriptionForTitle = imageDescription?.trim() ?? '';

      // The model decides whether the uploaded name is worth keeping; there is
      // no filename pattern analysis. Retries re-derive from the same persisted
      // description, so a retry cannot change an already-chosen name.
      if (descriptionForTitle)
        await this.applyDerivedTitle(
          userId,
          record,
          file,
          kind,
          undefined,
          descriptionForTitle,
        );

      parsedChunks = this.chunkPages([{ text: imageDescription ?? '' }]);
    } else {
      try {
        const parsed = await this.extraction.extract(file, storageKey);
        textContent = parsed.text;
        parsedChunks = parsed.chunks;
      } catch (error: unknown) {
        if (error instanceof DocumentParserError && !error.retryable)
          throw new NonRetryableDocumentError(
            documentParserFailureMessage(error.code),
          );
        throw error;
      }
    }

    if (kind === 'document' && textContent)
      await this.applyDerivedTitle(
        userId,
        record,
        file,
        kind,
        hint,
        textContent,
      );

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
      .filter(
        (index) =>
          !reusable ||
          !existing[index]?.embedded ||
          existing[index]?.embeddingModel !== this.embeddings.modelName() ||
          existing[index]?.embeddingVersion !== this.embeddings.version,
      );

    const embeddings =
      pending.length === 0
        ? []
        : await this.embeddings.embedMany(
            pending.map((index) => parsedChunks[index]!.content),
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

    if (reusable)
      await Promise.all(
        existing.map((chunk, index) => {
          const pageNumber = parsedChunks[index]?.pageNumber ?? null;

          return chunk.pageNumber === pageNumber
            ? Promise.resolve()
            : this.documents.updateChunkPage(chunk.id, pageNumber);
        }),
      );

    if (!(await this.documents.findById(userId, documentId))) {
      return;
    }

    const searchable = textContent ?? transcript ?? imageDescription ?? '';
    await this.documents.complete(documentId, {
      textContent,
      transcript,
      imageDescription,
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

  async remove(userId: string, documentId: string): Promise<boolean> {
    if (this.library)
      return this.library.execute(() =>
        this.library!.repository.withFileMutation(userId, documentId, () =>
          this.removeStoredDocument(userId, documentId),
        ),
      );

    return this.removeStoredDocument(userId, documentId);
  }

  private async removeStoredDocument(
    userId: string,
    documentId: string,
  ): Promise<boolean> {
    const key = await this.documents.storageKey(userId, documentId);
    if (!key) return false;
    await this.artifactCleanup.requestCleanup(userId, key);
    await this.storage.delete(key);
    await this.documents.delete(userId, documentId);
    // Once the record is gone, an in-flight worker either wrote before this
    // cleanup or observes deletion and cleans up its own later write.
    await this.extraction.deleteCheckpoint(key);

    return true;
  }

  async listMetadata(userId: string): Promise<DocumentMetadata[]> {
    return this.documents.listMetadata(userId);
  }

  async update(
    userId: string,
    documentId: string,
    input: DocumentUpdate,
  ): Promise<Document | null> {
    const action = () => this.documents.update(userId, documentId, input);

    return this.library ? this.library.execute(action) : action();
  }

  async listAttached(userId: string, messageId: string): Promise<Document[]> {
    return this.documents.findByMessageId(userId, messageId);
  }

  /**
   * Public content URL for a stored document, with its user-facing filename. Used to
   * hand files back to web chat as links instead of reading the stored bytes.
   */
  async linkFor(
    userId: string,
    documentId: string,
  ): Promise<{ filename: string; url: string } | null> {
    const document = await this.documents.findById(userId, documentId);
    if (!document) return null;

    return {
      filename: document.title,
      url: `${this.publicBaseUrl}/documents/${encodeURIComponent(documentId)}/content`,
    };
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
      filename: document.title,
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

  /**
   * Applies the model's naming decision to a document. A naming problem is
   * never allowed to fail the surrounding ingestion, so every failure path
   * returns the document with its current title.
   */
  private async applyDerivedTitle(
    userId: string,
    document: Document,
    file: UploadedFile,
    kind: FileKind,
    hint?: string,
    content?: string,
  ): Promise<Document> {
    try {
      const title = await this.deriveTitle(file, kind, hint, content);
      if (!title) return document;
      const updated = await this.documents.update(userId, document.id, {
        title,
      });

      return updated ?? document;
    } catch {
      return document;
    }
  }

  /**
   * Asks the model what the file should be called. Returns the chosen name, or
   * null to mean "keep the current title" — which covers a model that is
   * unavailable, a reply that scrubs to nothing, a reply that is the current
   * name, and a file with nothing to decide from.
   */
  private async deriveTitle(
    file: UploadedFile,
    kind: FileKind,
    hint: string | undefined,
    content?: string,
  ): Promise<string | null> {
    const normalizedHint = hint?.trim() ?? '';
    const normalizedContent = content?.trim() ?? '';
    const extracted = normalizedContent ? normalizedContent.slice(0, 4000) : '';

    // Without content or a user hint there is nothing to base a name on, so the
    // uploaded name is kept rather than replaced with an invented one.
    if (!extracted && !normalizedHint) return null;

    try {
      const result = await this.languageModel.generate({
        messages: [
          {
            role: 'system',
            content:
              'Tentukan nama file untuk perpustakaan file pribadi. Balas HANYA dengan satu nama file singkat dan jelas (maksimal 8 kata) dalam bahasa yang sama dengan isi file. Jika nama file asli sudah jelas dan bermakna bagi manusia, balas nama itu PERSIS tanpa perubahan. Jika nama file asli tampak dibuat mesin (id acak, kode, stempel waktu, seperti IMG_1234), susun nama deskriptif dari isi file. Pertahankan ekstensi file asli, tanpa pemisah path, dan tanpa tanda kutip.',
          },
          {
            role: 'user',
            content: [
              `Nama file asli: ${file.originalname}`,
              normalizedHint
                ? `Deskripsi dari pengguna: ${normalizedHint}`
                : '',
              extracted ? `Isi file: ${extracted}` : 'Isi file tidak tersedia.',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
        maxOutputTokens: 60,
      });

      const title = sanitizeDerivedTitle(result.text, file.originalname);
      if (!title) return null;
      const unchanged =
        title.toLocaleLowerCase() ===
        file.originalname.trim().toLocaleLowerCase();

      return unchanged ? null : title;
    } catch {
      // A model failure keeps the uploaded name; it must never break ingestion.
      return null;
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
