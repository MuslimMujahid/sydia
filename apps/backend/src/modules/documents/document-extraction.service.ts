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
    const warnings = new Set(parsed.warnings);
    let skippedImageCount = parsed.skippedImageCount;
    let visionFailure: Error | undefined;
    let visionCalls = 0;

    for (const [index, visual] of parsed.visuals.entries()) {
      const section = parsed.sections[visual.sectionIndex];
      if (!section) throw new DocumentParserError('INVALID_PAGE_REFERENCE');
      let description: string;

      try {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new DocumentParserError('EXTRACTION_TIMEOUT');
        visionCalls++;
        const output = await this.media.interpretDocumentImage(
          visual.buffer,
          visual.mimeType,
          visual.label,
          Math.min(remaining, 20_000),
        );

        if (output === null)
          throw new DocumentParserError('VISION_NOT_CONFIGURED');
        if (output.length > 20_000)
          throw new DocumentParserError('VISION_OUTPUT_LIMIT_EXCEEDED');
        if (!/[\p{L}\p{N}]/u.test(output.replace(/\[unreadable\]/gi, '')))
          throw new DocumentParserError('VISION_UNREADABLE');
        description = output.trim();
      } catch (error: unknown) {
        const code =
          error instanceof DocumentParserError
            ? error.code
            : 'VISION_REQUEST_FAILED';

        this.logger.warn({
          event: 'document-image-analysis-failed',
          code,
          errorName: error instanceof Error ? error.name : typeof error,
          sectionIndex: visual.sectionIndex,
        });
        warnings.add(code);
        visionFailure ??=
          error instanceof Error ? error : new DocumentParserError(code, true);

        if (code === 'VISION_NOT_CONFIGURED' || code === 'EXTRACTION_TIMEOUT') {
          skippedImageCount += parsed.visuals.length - index;
          break;
        }

        skippedImageCount++;
        continue;
      }

      const normalize = (text: string) =>
        text.replace(/\s+/g, ' ').trim().toLowerCase();

      // Keep extracted text authoritative. Do not index an identical transcription twice.
      if (!normalize(section.text).includes(normalize(description))) {
        const content = `[Vision interpretation${visual.label ? `: ${visual.label}` : ''}]\n${description}`;
        section.text = [section.text, content].filter(Boolean).join('\n\n');
        for (let offset = 0; offset < content.length; offset += 1220)
          section.chunks.push(content.slice(offset, offset + 1400));
      }

      section.methods.push('vision');
    }

    if (
      skippedImageCount > 0 &&
      !parsed.sections.some(
        (section) =>
          section.chunks.length > 0 && /[\p{L}\p{N}]/u.test(section.text),
      )
    )
      throw (
        visionFailure ?? new DocumentParserError('NO_READABLE_DOCUMENT_CONTENT')
      );

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
      warnings: [...warnings],
      skippedImageCount,
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
      visionCalls,
      skippedImageCount,
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
    } catch (error: unknown) {
      this.logger.warn({
        event: 'invalid-document-extraction-checkpoint',
        errorName: error instanceof Error ? error.name : typeof error,
      });

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
      typeof result.skippedImageCount !== 'number' ||
      !Number.isSafeInteger(result.skippedImageCount) ||
      result.skippedImageCount < 0 ||
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
