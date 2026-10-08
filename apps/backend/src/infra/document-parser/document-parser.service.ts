import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { fork, type ChildProcess } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { DocumentParserSettings } from './document-parser.config';
import {
  DocumentParserError,
  MAX_DOCUMENT_BYTES,
  OCR_CLEANUP_GRACE_MS,
  type ParsedDocument,
  type ParserFile,
  type ParserResponse,
  type ParserStage,
} from './document-parser.types';

@Injectable()
export class DocumentParserService implements OnModuleDestroy {
  private readonly children = new Map<ChildProcess, Promise<void>>();
  private languageDirectory?: Promise<string>;
  private readonly temporaryDirectories = new Set<string>();
  private readonly shutdown = new AbortController();
  private closing = false;
  constructor(readonly settings: DocumentParserSettings) {}

  async parse(file: ParserFile): Promise<ParsedDocument> {
    if (this.closing)
      throw new DocumentParserError('PARSER_PROCESS_STOPPED', true);
    if (!file.buffer.length) throw new DocumentParserError('EMPTY_DOCUMENT');
    if (file.buffer.length > MAX_DOCUMENT_BYTES)
      throw new DocumentParserError('FILE_TOO_LARGE');
    const deadline = performance.now() + this.settings.limits.timeoutMs;
    let preparationTimer: ReturnType<typeof setTimeout> | undefined;

    let stopPreparation = () => {};

    const interrupted = new Promise<never>((_resolve, reject) => {
      stopPreparation = () =>
        reject(new DocumentParserError('PARSER_PROCESS_STOPPED', true));
      this.shutdown.signal.addEventListener('abort', stopPreparation, {
        once: true,
      });
      preparationTimer = setTimeout(
        () =>
          reject(
            new DocumentParserError('OCR_ASSETS_PREPARATION_TIMEOUT', true),
          ),
        Math.max(0, deadline - performance.now()),
      );
    });

    let ocrLangPath: string;

    try {
      ocrLangPath = await Promise.race([this.languagePath(), interrupted]);
    } finally {
      clearTimeout(preparationTimer);
      this.shutdown.signal.removeEventListener('abort', stopPreparation);
    }

    if (this.closing)
      throw new DocumentParserError('PARSER_PROCESS_STOPPED', true);
    if (performance.now() >= deadline)
      throw new DocumentParserError('EXTRACTION_TIMEOUT');
    const sibling = join(__dirname, 'parser-process.js');
    const entry = existsSync(sibling)
      ? sibling
      : resolve(
          process.cwd(),
          'dist/src/infra/document-parser/parser-process.js',
        );

    return new Promise((resolveResult, reject) => {
      const child = fork(entry, [], {
        serialization: 'advanced',
        execArgv: [`--max-old-space-size=${this.settings.limits.memoryMb}`],
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });

      const closed = new Promise<void>((resolveClosed) => {
        child.once('close', () => {
          this.children.delete(child);
          resolveClosed();
        });
      });

      this.children.set(child, closed);
      let settled = false;
      const stageTimers = new Map<ParserStage, ReturnType<typeof setTimeout>>();

      const finish = (result?: ParsedDocument, error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        for (const stageTimer of stageTimers.values()) clearTimeout(stageTimer);
        stageTimers.clear();
        child.kill('SIGKILL');
        if (result) resolveResult(result);
        else
          reject(
            error ?? new DocumentParserError('PARSER_PROCESS_FAILED', true),
          );
      };

      const timer = setTimeout(
        () => finish(undefined, new DocumentParserError('EXTRACTION_TIMEOUT')),
        Math.max(0, deadline - performance.now()),
      );

      child.once('error', () =>
        finish(
          undefined,
          new DocumentParserError('PARSER_PROCESS_FAILED', true),
        ),
      );
      child.once('exit', () =>
        finish(
          undefined,
          new DocumentParserError(
            this.closing ? 'PARSER_PROCESS_STOPPED' : 'PARSER_PROCESS_FAILED',
            true,
          ),
        ),
      );
      child.on('message', (message: ParserResponse) => {
        if (settled) return;

        if ('stage' in message) {
          if (message.active) {
            // Repeated notifications must not extend an in-progress stage.
            if (!stageTimers.has(message.stage)) {
              const isOcr = message.stage === 'ocr';
              const budget = isOcr
                ? this.settings.limits.ocrTimeoutMs + OCR_CLEANUP_GRACE_MS
                : this.settings.limits.renderTimeoutMs;

              stageTimers.set(
                message.stage,
                setTimeout(
                  () =>
                    finish(
                      undefined,
                      new DocumentParserError(
                        isOcr ? 'OCR_TIMEOUT' : 'RENDER_TIMEOUT',
                      ),
                    ),
                  budget,
                ),
              );
            }
          } else {
            clearTimeout(stageTimers.get(message.stage));
            stageTimers.delete(message.stage);
          }

          return;
        }

        if (message.ok) finish(message.result);
        else
          finish(
            undefined,
            new DocumentParserError(message.code, message.retryable),
          );
      });
      child.send(
        { file, limits: { ...this.settings.limits, ocrLangPath } },
        (error: Error | null) => {
          if (error)
            finish(
              undefined,
              new DocumentParserError('PARSER_PROCESS_FAILED', true),
            );
        },
      );
    });
  }

  private languagePath(): Promise<string> {
    if (this.settings.limits.ocrLangPath)
      return Promise.resolve(this.settings.limits.ocrLangPath);
    if (this.languageDirectory) return this.languageDirectory;
    const preparation = (async () => {
      let directory: string | undefined;

      try {
        directory = await mkdtemp(join(tmpdir(), 'sydia-ocr-'));
        this.temporaryDirectories.add(directory);
        const target = directory;
        const copies = await Promise.allSettled(
          ['eng', 'ind'].map(async (code) => {
            await copyFile(
              join(
                dirname(require.resolve(`@tesseract.js-data/${code}`)),
                '4.0.0_best_int',
                `${code}.traineddata.gz`,
              ),
              join(target, `${code}.traineddata.gz`),
            );
          }),
        );

        const failures = copies.flatMap((result) =>
          result.status === 'rejected' ? [result.reason as unknown] : [],
        );

        if (failures.length)
          throw new AggregateError(failures, 'OCR language preparation failed');

        return directory;
      } catch (error: unknown) {
        let cause = error;

        if (directory) {
          try {
            await rm(directory, { recursive: true, force: true });
            this.temporaryDirectories.delete(directory);
          } catch (cleanupError: unknown) {
            cause = new AggregateError(
              [error, cleanupError],
              'OCR language cleanup failed',
            );
          }
        }

        const failure = new DocumentParserError(
          'OCR_ASSETS_PREPARATION_FAILED',
          true,
        );

        failure.cause = cause;
        throw failure;
      }
    })();

    this.languageDirectory = preparation;
    void preparation.catch(() => {
      if (this.languageDirectory === preparation)
        this.languageDirectory = undefined;
    });

    return preparation;
  }

  async onModuleDestroy(): Promise<void> {
    this.closing = true;
    this.shutdown.abort();
    const children = [...this.children.entries()];

    for (const [child] of children) child.kill('SIGKILL');
    await Promise.all(children.map(([, closed]) => closed));
    await this.languageDirectory?.catch(() => undefined);
    const cleanup = await Promise.allSettled(
      [...this.temporaryDirectories].map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
        this.temporaryDirectories.delete(directory);
      }),
    );

    const failures = cleanup.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : [],
    );

    if (failures.length)
      throw new AggregateError(
        failures,
        'OCR temporary directory cleanup failed',
      );
  }
}
