import { extname } from 'node:path';
import { unzipSync } from 'fflate';
import type { SupportedFileType } from 'officeparser';
import {
  DocumentParserError,
  MAX_DOCUMENT_BYTES,
  type ParserFile,
  type ParserLimits,
} from './document-parser.types';

type DocumentFormat =
  Exclude<SupportedFileType, 'odg' | 'epub' | 'tex'> | 'txt' | 'json';
const FORMATS: Record<string, DocumentFormat> = {
  pdf: 'pdf',
  docx: 'docx',
  xlsx: 'xlsx',
  pptx: 'pptx',
  odt: 'odt',
  ods: 'ods',
  odp: 'odp',
  rtf: 'rtf',
  md: 'md',
  markdown: 'md',
  csv: 'csv',
  html: 'html',
  htm: 'html',
  txt: 'txt',
  json: 'json',
};

const MIME_TYPES: Record<string, DocumentFormat> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'text/html': 'html',
  'application/json': 'json',
  'application/x-pdf': 'pdf',
  'application/x-rtf': 'rtf',
  'text/x-markdown': 'md',
  'text/comma-separated-values': 'csv',
  'application/csv': 'csv',
  'text/json': 'json',
};

const TEXT_FORMATS: readonly DocumentFormat[] = [
  'txt',
  'json',
  'md',
  'html',
  'csv',
  'rtf',
];

const ARCHIVE_FORMATS: readonly DocumentFormat[] = [
  'docx',
  'xlsx',
  'pptx',
  'odt',
  'ods',
  'odp',
];

const GENERIC_MIMES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
  'application/binary',
  'application/x-binary',
]);

const ZIP_MIMES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
]);

function resolveDocumentMetadata(
  file: Pick<ParserFile, 'originalname' | 'mimetype'>,
): {
  hint: DocumentFormat | undefined;
  zipMime: boolean;
} {
  const extension = extname(file.originalname).slice(1).toLowerCase();
  if (['doc', 'xls', 'ppt', 'epub', 'odg', 'tex', 'zip'].includes(extension))
    throw new DocumentParserError('UNSUPPORTED_FORMAT');
  const mime = (file.mimetype.split(';')[0] ?? '').trim().toLowerCase();
  const extensionFormat = FORMATS[extension];
  // Some spreadsheet clients advertise CSV as the legacy Excel MIME. Accept
  // that combination only with a CSV filename and subsequent UTF-8 validation.
  const mimeFormat =
    mime === 'application/vnd.ms-excel' && extensionFormat === 'csv'
      ? 'csv'
      : MIME_TYPES[mime];

  const genericMime = GENERIC_MIMES.has(mime);
  const zipMime = ZIP_MIMES.has(mime);
  if (!genericMime && !zipMime && !mimeFormat)
    throw new DocumentParserError(
      extensionFormat ? 'FORMAT_MISMATCH' : 'UNSUPPORTED_FORMAT',
    );
  const genericText =
    mime === 'text/plain' &&
    !!extensionFormat &&
    TEXT_FORMATS.includes(extensionFormat);

  if (
    extensionFormat &&
    mimeFormat &&
    extensionFormat !== mimeFormat &&
    !genericText
  )
    throw new DocumentParserError('FORMAT_MISMATCH');
  const hint = extensionFormat ?? mimeFormat;

  return { hint, zipMime };
}

/** Cheap ingress checks; full signature/archive validation stays in the parser child. */
export function assertDocumentUploadMetadata(file: ParserFile): void {
  if (!file.buffer.length) throw new DocumentParserError('EMPTY_DOCUMENT');
  const mime = (file.mimetype.split(';')[0] ?? '').trim().toLowerCase();
  const extension = extname(file.originalname).slice(1).toLowerCase();

  if (mime.startsWith('image/') || mime.startsWith('audio/')) {
    if (
      FORMATS[extension] ||
      ['doc', 'xls', 'ppt', 'epub', 'odg', 'tex', 'zip'].includes(extension)
    )
      resolveDocumentMetadata(file);
    const header = file.buffer.subarray(0, 8);
    if (
      header.subarray(0, 5).toString('ascii') === '%PDF-' ||
      header.subarray(0, 5).toString('ascii') === '{\\rtf' ||
      ['504b0304', '504b0506', '504b0708'].includes(
        header.subarray(0, 4).toString('hex'),
      ) ||
      header.toString('hex') === 'd0cf11e0a1b11ae1'
    )
      throw new DocumentParserError('FORMAT_MISMATCH');

    return;
  }

  resolveDocumentMetadata(file);
}

export async function resolveDocumentFormat(
  file: ParserFile,
  limits: ParserLimits,
): Promise<DocumentFormat> {
  if (!file.buffer.length) throw new DocumentParserError('EMPTY_DOCUMENT');
  if (file.buffer.length > MAX_DOCUMENT_BYTES)
    throw new DocumentParserError('FILE_TOO_LARGE');
  const { hint, zipMime } = resolveDocumentMetadata(file);
  const { fileTypeFromBuffer } = await import('file-type');
  const signature = await fileTypeFromBuffer(file.buffer);
  let detected = signature ? FORMATS[signature.ext] : undefined;
  if (signature?.ext === 'cfb')
    throw new DocumentParserError('PASSWORD_REQUIRED_OR_LEGACY_FORMAT');

  if (
    signature?.ext === 'zip' ||
    (detected !== undefined && ARCHIVE_FORMATS.includes(detected))
  ) {
    // Check expanded sizes before allocating any archive member. officeParser enforces
    // the same limits again while parsing; this also validates format declarations.
    let expanded = 0;
    let entries = 0;
    const archive = unzipSync(file.buffer, {
      filter: (entry) => {
        expanded += entry.originalSize;
        if (expanded > limits.maxArchiveBytes || ++entries > 2000)
          throw new DocumentParserError('ARCHIVE_LIMIT_EXCEEDED');

        return ['mimetype', '[Content_Types].xml'].includes(entry.name);
      },
    });

    const types = Buffer.from(archive['[Content_Types].xml'] ?? []).toString(
      'utf8',
    );

    const odfMime = Buffer.from(archive.mimetype ?? [])
      .toString('utf8')
      .trim();

    detected =
      MIME_TYPES[odfMime] ??
      (types.includes('wordprocessingml.document.main+xml')
        ? 'docx'
        : types.includes('spreadsheetml.sheet.main+xml')
          ? 'xlsx'
          : types.includes('presentationml.presentation.main+xml')
            ? 'pptx'
            : undefined);
    if (!detected) throw new DocumentParserError('UNSUPPORTED_FORMAT');
  }

  if (signature && !detected)
    throw new DocumentParserError('UNSUPPORTED_FORMAT');
  if (detected && hint && detected !== hint)
    throw new DocumentParserError('FORMAT_MISMATCH');
  const format = detected ?? hint;
  if (!format) throw new DocumentParserError('UNSUPPORTED_FORMAT');
  if (zipMime && !ARCHIVE_FORMATS.includes(format))
    throw new DocumentParserError('FORMAT_MISMATCH');
  if (!detected && !TEXT_FORMATS.includes(format))
    throw new DocumentParserError('CORRUPT_DOCUMENT');
  if (
    !detected &&
    (file.buffer.includes(0) || file.buffer.toString('utf8').includes('\ufffd'))
  )
    throw new DocumentParserError('INVALID_TEXT_ENCODING');
  if (
    format === 'rtf' &&
    !file.buffer.subarray(0, 16).toString().startsWith('{\\rtf')
  )
    throw new DocumentParserError('CORRUPT_DOCUMENT');

  return format;
}
