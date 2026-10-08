import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ParserLimits } from './document-parser.types';

const SETTINGS = {
  timeoutMs: ['BACKEND_DOCUMENT_TIMEOUT_MS', 60_000, 1_000, 90_000],
  renderTimeoutMs: ['BACKEND_DOCUMENT_RENDER_TIMEOUT_MS', 10_000, 1000, 30_000],
  memoryMb: ['BACKEND_DOCUMENT_MEMORY_MB', 512, 128, 2048],
  maxPages: ['BACKEND_DOCUMENT_MAX_PAGES', 100, 1, 1000],
  maxArchiveBytes: [
    'BACKEND_DOCUMENT_MAX_ARCHIVE_BYTES',
    64 * 1024 * 1024,
    1024,
    256 * 1024 * 1024,
  ],
  maxTextChars: ['BACKEND_DOCUMENT_MAX_TEXT_CHARS', 2_000_000, 100, 5_000_000],
  maxChunks: ['BACKEND_DOCUMENT_MAX_CHUNKS', 2000, 1, 10_000],
  maxImages: ['BACKEND_DOCUMENT_MAX_IMAGES', 20, 1, 100],
  maxImagePixels: [
    'BACKEND_DOCUMENT_MAX_IMAGE_PIXELS',
    8_000_000,
    10_000,
    16_000_000,
  ],
  maxImageBytes: [
    'BACKEND_DOCUMENT_MAX_IMAGE_BYTES',
    3 * 1024 * 1024,
    1024,
    10 * 1024 * 1024,
  ],
  ocrTimeoutMs: ['BACKEND_DOCUMENT_OCR_TIMEOUT_MS', 15_000, 1000, 30_000],
  maxVisionCalls: ['BACKEND_DOCUMENT_MAX_VISION_CALLS', 5, 1, 20],
  concurrency: ['BACKEND_DOCUMENT_CONCURRENCY', 1, 1, 4],
} as const;

export function validateDocumentParserEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const [name, fallback, minimum, maximum] of Object.values(SETTINGS)) {
    const raw = config[name];
    if (raw !== undefined && typeof raw !== 'string' && typeof raw !== 'number')
      throw new Error(`${name} must be a number`);
    const value = raw === undefined || raw === '' ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
      throw new Error(
        `${name} must be an integer between ${minimum} and ${maximum}`,
      );
    values[name] = value;
  }

  const langPath = config.BACKEND_DOCUMENT_OCR_LANG_PATH;
  if (
    langPath !== undefined &&
    (typeof langPath !== 'string' ||
      /^[a-z][a-z\d+.-]*:/i.test(langPath.trim()))
  )
    throw new Error('BACKEND_DOCUMENT_OCR_LANG_PATH must be a local directory');
  values.BACKEND_DOCUMENT_OCR_LANG_PATH = langPath;

  return values;
}

@Injectable()
export class DocumentParserSettings {
  readonly limits: ParserLimits;

  constructor(config: ConfigService) {
    const raw: Record<string, unknown> = {};
    for (const [name] of Object.values(SETTINGS))
      raw[name] = config.get<unknown>(name);
    raw.BACKEND_DOCUMENT_OCR_LANG_PATH = config.get<unknown>(
      'BACKEND_DOCUMENT_OCR_LANG_PATH',
    );
    const validated = validateDocumentParserEnvironment(raw);
    this.limits = Object.fromEntries(
      Object.entries(SETTINGS).map(([key, [name]]) => [key, validated[name]]),
    ) as ParserLimits;
    const langPath = validated.BACKEND_DOCUMENT_OCR_LANG_PATH;
    if (typeof langPath === 'string' && langPath.trim())
      this.limits.ocrLangPath = langPath.trim();
  }
}
