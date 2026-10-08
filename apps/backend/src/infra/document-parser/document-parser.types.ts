import { MAX_MEDIA_BYTES } from '../../shared/messaging';

export const DOCUMENT_PARSER_VERSION = 'officeparser-8.1.1';
export const DOCUMENT_POLICY_VERSION = 3;
export const MAX_DOCUMENT_BYTES = MAX_MEDIA_BYTES;
export const OCR_CLEANUP_GRACE_MS = 1000;
export type ParserStage = 'render' | 'ocr';

export type ParserFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

export type ExtractionMethod = 'native' | 'ocr' | 'vision';
export type ExtractionChunk = {
  chunkIndex: number;
  pageNumber: number | null;
  content: string;
};
export type ExtractedSection = {
  label: string;
  pageNumber: number | null;
  text: string;
  chunks: string[];
  methods: ExtractionMethod[];
};
export type DocumentVisual = {
  sectionIndex: number;
  label: string;
  mimeType: 'image/png';
  buffer: Buffer;
  reason: 'unreadable' | 'visual';
};
export type ParsedDocument = {
  sections: ExtractedSection[];
  visuals: DocumentVisual[];
  warnings: string[];
};
export type ExtractionResult = {
  text: string;
  chunks: ExtractionChunk[];
  methods: ExtractionMethod[];
  warnings: string[];
};
export type ParserLimits = {
  timeoutMs: number;
  renderTimeoutMs: number;
  memoryMb: number;
  maxPages: number;
  maxArchiveBytes: number;
  maxTextChars: number;
  maxChunks: number;
  maxImages: number;
  maxImagePixels: number;
  maxImageBytes: number;
  ocrTimeoutMs: number;
  maxVisionCalls: number;
  concurrency: number;
  ocrLangPath?: string;
};
export type ParserRequest = { file: ParserFile; limits: ParserLimits };
export type ParserResponse =
  | { stage: ParserStage; active: boolean }
  | { ok: true; result: ParsedDocument }
  | { ok: false; code: string; retryable: boolean };

export class DocumentParserError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
  ) {
    super(`Document extraction failed: ${code}`);
    this.name = 'DocumentParserError';
  }
}
