import { createWorker, OEM } from 'tesseract.js';
import {
  DocumentParserError,
  type ParserLimits,
} from './document-parser.types';

type OcrResult = { text: string; tsv: string | null; confidence: number };

interface OcrWorker {
  setParameters(parameters: {
    preserve_interword_spaces: string;
  }): Promise<unknown>;
  recognize(
    image: Buffer,
    options: Record<string, never>,
    output: { text: true; tsv: true },
  ): Promise<{ data: OcrResult }>;
  terminate(): Promise<unknown>;
}

export class LocalOcr {
  private worker?: OcrWorker;
  private readonly initializations = new Set<Promise<void>>();

  constructor(
    private readonly limits: ParserLimits,
    private readonly create: () => Promise<OcrWorker> = () =>
      createWorker('eng+ind', OEM.LSTM_ONLY, {
        langPath: limits.ocrLangPath,
        cacheMethod: 'none',
        gzip: true,
        logger: () => {},
        errorHandler: () => {},
      }),
  ) {}

  async recognize(image: Buffer): Promise<OcrResult> {
    if (!this.limits.ocrLangPath)
      throw new DocumentParserError('OCR_ASSETS_MISSING');
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        expired = true;
        reject(new DocumentParserError('OCR_TIMEOUT'));
      }, this.limits.ocrTimeoutMs);
    });

    // The same budget covers loading the languages, configuration, and recognition.
    // A worker that finishes initializing after timeout must never be reused.
    const operation = async (): Promise<OcrResult> => {
      if (!this.worker) {
        const initialization = (async () => {
          const worker = await this.create();

          if (expired) {
            await worker.terminate();
            throw new DocumentParserError('OCR_TIMEOUT');
          }

          this.worker = worker;
          await worker.setParameters({ preserve_interword_spaces: '1' });
        })();

        this.initializations.add(initialization);

        try {
          await initialization;
        } finally {
          this.initializations.delete(initialization);
        }
      }

      if (expired) throw new DocumentParserError('OCR_TIMEOUT');
      const worker = this.worker;
      if (!worker) throw new DocumentParserError('OCR_FAILED');
      const result = await worker.recognize(
        image,
        {},
        { text: true, tsv: true },
      );

      return result.data;
    };

    try {
      return await Promise.race([operation(), deadline]);
    } catch (error) {
      expired = true;
      await this.close();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async close(): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;
    await worker?.terminate();
  }

  async waitForInitialization(): Promise<void> {
    // Keep the parent watchdog active until late workers have been disposed.
    await Promise.allSettled([...this.initializations]);
  }
}
