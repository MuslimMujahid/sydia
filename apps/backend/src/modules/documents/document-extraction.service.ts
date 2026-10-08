import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  DOCUMENT_PARSER_VERSION,
  DOCUMENT_POLICY_VERSION,
  DocumentParserError,
  DocumentParserService,
  type ExtractionResult,
  type ExtractionMethod,
  type ParserFile,
} from '../../infra/document-parser';
import { OpenRouterMediaService } from '../../infra/model-gateway';
import { StorageReadLimitError, StorageService } from '../../infra/storage';
import { extractionKey } from '../../shared/documents';

export { extractionKey } from '../../shared/documents';

const METHODS: ExtractionMethod[] = ['native', 'ocr', 'vision'];
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

@Injectable()
export class DocumentExtractionService {
  private readonly logger = new Logger(DocumentExtractionService.name);
  constructor(
    private readonly parser: DocumentParserService,
    private readonly media: OpenRouterMediaService,
    private readonly storage: StorageService,
  ) {}

  get settings() {
    return this.parser.settings;
  }

  async extract(
    file: ParserFile,
    storageKey: string,
  ): Promise<ExtractionResult> {
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const cached = await this.readCheckpoint(storageKey, checksum);

    if (cached) {
      this.logger.log({
        event: 'document-extraction-cache-hit',
        parserVersion: DOCUMENT_PARSER_VERSION,
        policyVersion: DOCUMENT_POLICY_VERSION,
        chunkCount: cached.chunks.length,
      });

      return cached;
    }

    const started = Date.now();
    const parsed = await this.parser.parse(file);
    const deadline = started + this.settings.limits.timeoutMs + 25_000;

    for (const visual of parsed.visuals) {
      const section = parsed.sections[visual.sectionIndex];
      if (!section) throw new DocumentParserError('INVALID_PAGE_REFERENCE');
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new DocumentParserError('EXTRACTION_TIMEOUT');
      const description = await this.media.interpretDocumentImage(
        visual.buffer,
        visual.mimeType,
        visual.label,
        Math.min(remaining, 20_000),
      );

      if (!description?.trim())
        throw new DocumentParserError('VISION_NOT_CONFIGURED');
      if (description.length > 20_000)
        throw new DocumentParserError('VISION_OUTPUT_LIMIT_EXCEEDED');
      if (!/[\p{L}\p{N}]/u.test(description.replace(/\[unreadable\]/gi, '')))
        throw new DocumentParserError('VISION_UNREADABLE');
      const normalize = (text: string) =>
        text.replace(/\s+/g, ' ').trim().toLowerCase();

      // Keep extracted text authoritative. Do not index an identical transcription twice.
      if (!normalize(section.text).includes(normalize(description))) {
        const content = `[Vision interpretation${visual.label ? `: ${visual.label}` : ''}]\n${description.trim()}`;
        section.text = [section.text, content].filter(Boolean).join('\n\n');
        for (let offset = 0; offset < content.length; offset += 1220)
          section.chunks.push(content.slice(offset, offset + 1400));
      }

      section.methods.push('vision');
    }

    const result: ExtractionResult = {
      text: parsed.sections
        .map(
          (section) =>
            `${section.label ? `[${section.label}]\n` : ''}${section.text}`,
        )
        .filter((text) => text.trim())
        .join('\n\n'),
      chunks: parsed.sections
        .flatMap((section) =>
          section.chunks
            .filter((content) => content.trim())
            .map((content) => ({
              chunkIndex: 0,
              pageNumber: section.pageNumber,
              content,
            })),
        )
        .map((chunk, chunkIndex) => ({ ...chunk, chunkIndex })),
      methods: [
        ...new Set(parsed.sections.flatMap((section) => section.methods)),
      ],
      warnings: parsed.warnings,
    };

    if (!result.chunks.length) throw new DocumentParserError('EMPTY_DOCUMENT');
    if (
      result.text.length > this.settings.limits.maxTextChars ||
      result.chunks.length > this.settings.limits.maxChunks
    )
      throw new DocumentParserError('OUTPUT_LIMIT_EXCEEDED');
    const checkpoint = Buffer.from(
      JSON.stringify({
        parserVersion: DOCUMENT_PARSER_VERSION,
        policyVersion: DOCUMENT_POLICY_VERSION,
        checksum,
        result,
      }),
    );

    if (checkpoint.length > this.settings.limits.maxTextChars * 8)
      throw new DocumentParserError('CHECKPOINT_LIMIT_EXCEEDED');
    await this.storage.put(
      extractionKey(storageKey),
      checkpoint,
      'application/json',
    );
    this.logger.log({
      event: 'document-extraction-completed',
      parserVersion: DOCUMENT_PARSER_VERSION,
      policyVersion: DOCUMENT_POLICY_VERSION,
      durationMs: Date.now() - started,
      sections: parsed.sections.length,
      chunkCount: result.chunks.length,
      methods: result.methods,
      warnings: result.warnings,
      visionCalls: parsed.visuals.length,
    });

    return result;
  }

  private async readCheckpoint(
    storageKey: string,
    checksum: string,
  ): Promise<ExtractionResult | null> {
    let bytes: Buffer;

    try {
      bytes = await this.storage.get(
        extractionKey(storageKey),
        this.settings.limits.maxTextChars * 8,
      );
    } catch (error: unknown) {
      if (error instanceof StorageReadLimitError) return null;
      if (
        record(error) &&
        (['ENOENT', 'NoSuchKey', 'NotFound'].includes(
          String(error.code ?? error.name),
        ) ||
          (record(error.$metadata) && error.$metadata.httpStatusCode === 404))
      )
        return null;
      throw error;
    }

    if (bytes.length > this.settings.limits.maxTextChars * 8) return null;
    let value: unknown;

    try {
      value = JSON.parse(bytes.toString('utf8'));
    } catch {
      return null;
    }

    if (
      !record(value) ||
      value.parserVersion !== DOCUMENT_PARSER_VERSION ||
      value.policyVersion !== DOCUMENT_POLICY_VERSION ||
      value.checksum !== checksum ||
      !record(value.result)
    )
      return null;
    const result = value.result;
    if (
      typeof result.text !== 'string' ||
      !result.text.trim() ||
      result.text.length > this.settings.limits.maxTextChars ||
      !Array.isArray(result.chunks) ||
      !result.chunks.length ||
      result.chunks.length > this.settings.limits.maxChunks ||
      !Array.isArray(result.methods) ||
      !result.methods.length ||
      result.methods.length > METHODS.length ||
      !Array.isArray(result.warnings)
    )
      return null;
    if (
      !result.methods.every((method: unknown) =>
        METHODS.includes(method as ExtractionMethod),
      ) ||
      !result.warnings.every(
        (warning: unknown) =>
          typeof warning === 'string' && warning.length <= 100,
      ) ||
      result.warnings.length > 100
    )
      return null;
    let total = 0;
    const valid = result.chunks.every((chunk: unknown, index: number) => {
      if (
        !record(chunk) ||
        chunk.chunkIndex !== index ||
        typeof chunk.content !== 'string' ||
        !chunk.content.trim() ||
        chunk.content.length > 4096
      )
        return false;
      total += chunk.content.length;

      return (
        chunk.pageNumber === null ||
        (typeof chunk.pageNumber === 'number' &&
          Number.isSafeInteger(chunk.pageNumber) &&
          chunk.pageNumber > 0 &&
          chunk.pageNumber <= this.settings.limits.maxPages)
      );
    });

    if (!valid || total > this.settings.limits.maxTextChars * 2) return null;

    return result as ExtractionResult;
  }

  async deleteCheckpoint(storageKey: string): Promise<void> {
    await this.storage.delete(extractionKey(storageKey));
  }
}
