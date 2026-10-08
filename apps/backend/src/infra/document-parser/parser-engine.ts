import { createHash } from 'node:crypto';
import {
  OfficeGenerator,
  OfficeParser,
  type OfficeContentNode,
  type OfficeParserAST,
  type OfficeChunk,
} from 'officeparser';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { LocalOcr } from './local-ocr';
import { resolveDocumentFormat } from './document-format';
import {
  DocumentParserError,
  type DocumentVisual,
  type ExtractedSection,
  type ParsedDocument,
  type ParserLimits,
  type ParserRequest,
  type ParserStage,
} from './document-parser.types';

export function splitDocumentText(
  text: string,
  size = 1400,
  overlap = 180,
): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const chunks: string[] = [];
  for (let start = 0; start < normalized.length; start += size - overlap)
    chunks.push(normalized.slice(start, start + size));

  return chunks;
}

export function readableText(text: string): boolean {
  const visible = text.replace(/\s/g, '');
  const letters = visible.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  const corrupt = Array.from(visible).filter((character) => {
    const code = character.charCodeAt(0);

    return character === '\ufffd' || code <= 8 || (code >= 14 && code <= 31);
  }).length;

  return letters >= 12 && corrupt / Math.max(visible.length, 1) < 0.05;
}

function descendants(nodes: OfficeContentNode[]): OfficeContentNode[] {
  return nodes.flatMap((node) => [node, ...descendants(node.children ?? [])]);
}

function sectionLabel(node: OfficeContentNode, index: number): string {
  if (node.type === 'page')
    return `Page ${node.metadata?.pageNumber ?? index + 1}`;
  if (node.type === 'slide')
    return `Slide ${node.metadata?.slideNumber ?? index + 1}`;
  if (node.type === 'sheet')
    return `Sheet ${node.metadata?.sheetName ?? index + 1}`;

  return '';
}

function labelChunk(chunk: OfficeChunk, section: ExtractedSection): string {
  const heading: unknown = chunk.metadata.closestHeading;
  const context = [
    section.label,
    typeof heading === 'string' ? heading : '',
  ].filter(Boolean);

  return `${context.length ? `[${context.join(' / ')}]\n` : ''}${chunk.text.trim()}`;
}

// TSV word boxes retain column alignment for scanned forms/tables without treating
// each column's text as an unrelated value. Word text is never rewritten.
function ocrLayout(tsv: string | null, fallback: string): string {
  if (!tsv) return fallback.trim();
  const words = tsv
    .split('\n')
    .slice(1)
    .flatMap((line) => {
      const fields = line.split('\t');
      if (fields[0] !== '5' || !fields[11]?.trim() || Number(fields[10]) < 30)
        return [];

      return [
        {
          x: Number(fields[6]),
          y: Number(fields[7]),
          width: Number(fields[8]),
          height: Number(fields[9]),
          text: fields.slice(11).join('\t').trim(),
        },
      ];
    });

  if (!words.length) return fallback.trim();
  const widths = words
    .map((word) => word.width / Math.max(word.text.length, 1))
    .sort((a, b) => a - b);

  const characterWidth = Math.max(
    widths[Math.floor(widths.length / 2)] ?? 1,
    1,
  );

  const lines: Array<{ y: number; height: number; words: typeof words }> = [];

  for (const word of words.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.find(
      (row) =>
        Math.abs(row.y - word.y) < Math.min(row.height, word.height) * 0.6,
    );

    if (line) line.words.push(word);
    else lines.push({ y: word.y, height: word.height, words: [word] });
  }

  const left = Math.min(...words.map((word) => word.x));

  return lines
    .map((line) => {
      let out = '';

      for (const word of line.words.sort((a, b) => a.x - b.x)) {
        const column = Math.min(
          240,
          Math.round((word.x - left) / characterWidth),
        );

        out +=
          ' '.repeat(Math.max(out.length ? 1 : 0, column - out.length)) +
          word.text;
      }

      return out.trimEnd();
    })
    .join('\n');
}

function imagePixels(bytes: Buffer): number {
  if (
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.length >= 24
  )
    return bytes.readUInt32BE(16) * bytes.readUInt32BE(20);

  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;

    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 255) break;
      const marker = bytes[offset + 1] ?? 0;
      if (marker === 217 || marker === 218) break;
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      )
        return bytes.readUInt16BE(offset + 5) * bytes.readUInt16BE(offset + 7);
      offset += length + 2;
    }
  }

  throw new DocumentParserError('UNSUPPORTED_EMBEDDED_IMAGE');
}

async function normalizeImage(
  bytes: Buffer,
  limits: ParserLimits,
): Promise<Buffer> {
  if (
    bytes.length > limits.maxImageBytes ||
    imagePixels(bytes) > limits.maxImagePixels
  )
    throw new DocumentParserError('IMAGE_LIMIT_EXCEEDED');
  const image = await loadImage(bytes);
  if (image.width * image.height > limits.maxImagePixels)
    throw new DocumentParserError('IMAGE_LIMIT_EXCEEDED');
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  const png = canvas.toBuffer('image/png');
  if (png.length > limits.maxImageBytes)
    throw new DocumentParserError('IMAGE_LIMIT_EXCEEDED');

  return png;
}

function mergeRecognized(native: string, recognized: string): string {
  const normalize = (text: string) =>
    text.replace(/\s+/g, ' ').trim().toLowerCase();

  const existing = normalize(native);
  if (normalize(recognized).includes(existing) && existing)
    return recognized.trim();
  const additional = recognized
    .split('\n')
    .filter((line) => {
      const normalized = normalize(line);

      return normalized && !existing.includes(normalized);
    })
    .join('\n');

  return [native.trim(), additional].filter(Boolean).join('\n');
}

export async function parseLocalDocument(
  { file, limits }: ParserRequest,
  reportStage?: (stage: ParserStage, active: boolean) => Promise<void>,
): Promise<ParsedDocument> {
  const format = await resolveDocumentFormat(file, limits);

  if (format === 'txt' || format === 'json') {
    const text = file.buffer.toString('utf8').trim();
    if (text.length > limits.maxTextChars)
      throw new DocumentParserError('TEXT_LIMIT_EXCEEDED');
    const chunks = splitDocumentText(text);
    if (chunks.length > limits.maxChunks)
      throw new DocumentParserError('CHUNK_LIMIT_EXCEEDED');

    return {
      sections: [
        {
          label: '',
          pageNumber: null,
          text,
          chunks,
          methods: ['native'],
        },
      ],
      visuals: [],
      warnings: [],
    };
  }

  const ast = await OfficeParser.parseOffice(file.buffer, {
    fileType: format,
    extractAttachments: true,
    ocr: false,
    includeRawContent: false,
    ignoreSlideMasters: true,
    onWarning: () => {},
    pdfParserConfig: { separateProcess: false, extractTextColor: false },
    decompressionLimits: {
      maxUncompressedBytes: limits.maxArchiveBytes,
      maxZipEntries: 2000,
      maxTableCells: 100_000,
      maxXmlElements: 300_000,
      maxRepeatedContent: limits.maxTextChars,
    },
  });

  const warnings: string[] = ast.warnings.map((warning) => warning.code);
  if (
    warnings.some(
      (code) =>
        /LIMIT_EXCEEDED|TRUNCATED|ENCODING_SUSPECT/.test(code) &&
        !code.includes('ENCODING'),
    )
  )
    throw new DocumentParserError('CONTENT_LIMIT_EXCEEDED');
  const hasContainers = ast.content.some((node) =>
    ['page', 'slide', 'sheet'].includes(node.type),
  );

  const containers = hasContainers
    ? ast.content
    : [{ type: 'paragraph' as const, children: ast.content }];

  if (containers.length > limits.maxPages)
    throw new DocumentParserError('PAGE_LIMIT_EXCEEDED');
  if (
    ast.attachments.filter((attachment) => attachment.type === 'image').length >
    limits.maxImages
  )
    throw new DocumentParserError('IMAGE_LIMIT_EXCEEDED');
  const sections: ExtractedSection[] = [];
  const visuals: DocumentVisual[] = [];
  const ocr = new LocalOcr(limits);
  let usedOcr = false;
  let pdf:
    import('pdfjs-dist/types/src/display/api').PDFDocumentProxy | undefined;

  try {
    if (format === 'pdf') {
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdf = await getDocument({
        data: new Uint8Array(file.buffer),
        useSystemFonts: true,
        maxImageSize: limits.maxImagePixels,
      }).promise;
      if (pdf.numPages > limits.maxPages)
        throw new DocumentParserError('PAGE_LIMIT_EXCEEDED');
    }

    for (const [index, node] of containers.entries()) {
      const localAst: OfficeParserAST = {
        ...ast,
        content: hasContainers ? [node] : ast.content,
        auxiliary: undefined,
      };

      const converted = await OfficeGenerator.generate(localAst, 'text', {
        includeImages: 'none',
        textConfig: { preserveLayout: true },
      });

      const section: ExtractedSection = {
        label: sectionLabel(node, index),
        pageNumber:
          node.type === 'page'
            ? (node.metadata?.pageNumber ?? index + 1)
            : null,
        text: converted.value.trim(),
        chunks: [],
        methods: ['native'],
      };

      const chunkAst: OfficeParserAST = {
        ...localAst,
        content: localAst.content.map((container) =>
          container.type === 'sheet'
            ? {
                ...container,
                children: [
                  {
                    type: 'table' as const,
                    children: (container.children ?? []).filter(
                      (child) => child.type === 'row',
                    ),
                  },
                  ...(container.children ?? []).filter(
                    (child) => child.type !== 'row',
                  ),
                ],
              }
            : container,
        ),
      };

      const generated = await OfficeGenerator.generate(chunkAst, 'chunks', {
        includeImages: 'none',
        chunksConfig: {
          strategy: 'document-structure',
          splitBy: 'heading',
          maxChunkSize: 1400,
          tableSplitStrategy: 'row',
          // Account for the separator added between rows. Otherwise the upstream
          // table grouper can overfill a chunk and split off rows without headers.
          lengthFunction: (text) => text.length + 1,
        },
      });

      section.chunks = generated.value
        .filter((chunk) => chunk.text.trim())
        .map((chunk) => labelChunk(chunk, section));
      const imageNodes = descendants([node]).filter(
        (child) => child.type === 'image',
      );

      const candidates: Array<{
        buffer: Buffer;
        needsOcr: boolean;
        visual: boolean;
      }> = [];

      if (pdf && section.pageNumber) {
        const page = await pdf.getPage(section.pageNumber);
        const operators = await page.getOperatorList();
        const { OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const hasRaster = operators.fnArray.some((operation) =>
          [
            OPS.paintImageXObject,
            OPS.paintInlineImageXObject,
            OPS.paintImageMaskXObject,
          ].includes(operation),
        );

        const viewport = page.getViewport({ scale: 1 });
        let largePaths = 0;
        let filledShapes = 0;
        let connectors = 0;

        for (const [position, operation] of operators.fnArray.entries()) {
          if (operation !== OPS.constructPath) continue;
          const argumentsValue: unknown = operators.argsArray[position];
          if (!Array.isArray(argumentsValue)) continue;
          const paint: unknown = argumentsValue[0];
          const bounds: unknown = argumentsValue[2];
          if (
            typeof paint !== 'number' ||
            !(bounds instanceof Float32Array) ||
            bounds.length !== 4
          )
            continue;
          const area = Math.abs(
            (bounds[2]! - bounds[0]!) * (bounds[3]! - bounds[1]!),
          );

          if (area > viewport.width * viewport.height * 0.005) {
            largePaths++;
            if (
              [
                OPS.fill,
                OPS.eoFill,
                OPS.fillStroke,
                OPS.eoFillStroke,
                OPS.closeFillStroke,
                OPS.closeEOFillStroke,
              ].includes(paint)
            )
              filledShapes++;
          } else if ([OPS.stroke, OPS.closeStroke].includes(paint))
            connectors++;
        }

        // Large shapes with connectors, or multiple filled shapes, can encode
        // relationships absent from native text. Thin table rules alone do not.
        const meaningfulVectors =
          filledShapes >= 2 || (largePaths >= 2 && connectors >= 1);

        const largeRaster = imageNodes.some(
          (image) =>
            image.bounds &&
            image.bounds.width * image.bounds.height >
              viewport.width * viewport.height * 0.4,
        );

        const needsOcr =
          (hasRaster &&
            (!readableText(section.text) ||
              (largeRaster && section.text.length < 200))) ||
          (!!section.text && !readableText(section.text));

        const visual =
          (hasRaster &&
            !needsOcr &&
            imageNodes.some(
              (image) =>
                !image.bounds ||
                image.bounds.width * image.bounds.height >
                  viewport.width * viewport.height * 0.08,
            )) ||
          meaningfulVectors;

        if (needsOcr || visual) {
          await reportStage?.('render', true);

          try {
            const scale = Math.min(
              2,
              Math.sqrt(
                limits.maxImagePixels / (viewport.width * viewport.height),
              ),
            );

            const rendering = page.getViewport({ scale });
            const canvas = createCanvas(
              Math.max(1, Math.floor(rendering.width)),
              Math.max(1, Math.floor(rendering.height)),
            );

            await page.render({
              canvas: canvas as unknown as HTMLCanvasElement,
              canvasContext: canvas.getContext(
                '2d',
              ) as unknown as CanvasRenderingContext2D,
              viewport: rendering,
            }).promise;
            const buffer = canvas.toBuffer('image/png');
            if (buffer.length > limits.maxImageBytes)
              throw new DocumentParserError('IMAGE_LIMIT_EXCEEDED');
            candidates.push({ buffer, needsOcr, visual });
          } finally {
            await reportStage?.('render', false);
          }
        }

        page.cleanup();
      } else {
        const seenImages = new Set<string>();

        for (const image of imageNodes) {
          if (image.type !== 'image') continue;
          const attachment = ast.attachments.find(
            (asset) => asset.name === image.metadata?.attachmentName,
          );

          if (
            /\b(logo|icon|watermark)\b/i.test(
              image.metadata?.altText ?? attachment?.altText ?? '',
            )
          )
            continue;

          if (!attachment?.data) {
            if (image.metadata?.attachmentName)
              throw new DocumentParserError('IMAGE_EXTRACTION_FAILED');
            continue;
          }

          await reportStage?.('render', true);
          let buffer: Buffer;

          try {
            buffer = await normalizeImage(
              Buffer.from(attachment.data, 'base64'),
              limits,
            );
          } finally {
            await reportStage?.('render', false);
          }

          const decoded = await loadImage(buffer);
          if (decoded.width < 160 || decoded.height < 100) continue;
          const digest = createHash('sha256').update(buffer).digest('hex');
          if (seenImages.has(digest)) continue;
          seenImages.add(digest);
          candidates.push({
            buffer,
            needsOcr: !readableText(section.text),
            visual: true,
          });
        }
      }

      for (const candidate of candidates) {
        let required = candidate.visual;

        if (candidate.needsOcr) {
          usedOcr = true;
          await reportStage?.('ocr', true);

          try {
            const recognized = await ocr.recognize(candidate.buffer);

            if (readableText(recognized.text) && recognized.confidence >= 50) {
              section.text = mergeRecognized(
                section.text,
                ocrLayout(recognized.tsv, recognized.text),
              );
              section.chunks = splitDocumentText(section.text).map(
                (text) =>
                  `${section.label ? `[${section.label}]\n` : ''}${text}`,
              );
              section.methods.push('ocr');
            } else {
              required = true;
              warnings.push('OCR_LOW_CONFIDENCE');
            }
          } catch {
            required = true;
            warnings.push('OCR_FAILED');
          } finally {
            await ocr.waitForInitialization();
            await reportStage?.('ocr', false);
          }
        }

        if (required) {
          if (visuals.length >= limits.maxVisionCalls)
            throw new DocumentParserError('VISION_LIMIT_EXCEEDED');
          visuals.push({
            sectionIndex: index,
            label: section.label,
            mimeType: 'image/png',
            buffer: candidate.buffer,
            reason:
              candidate.needsOcr && !section.methods.includes('ocr')
                ? 'unreadable'
                : 'visual',
          });
        }
      }

      sections.push(section);
      if (
        sections.reduce((total, item) => total + item.text.length, 0) >
        limits.maxTextChars
      )
        throw new DocumentParserError('TEXT_LIMIT_EXCEEDED');
      if (
        sections.reduce((total, item) => total + item.chunks.length, 0) >
        limits.maxChunks
      )
        throw new DocumentParserError('CHUNK_LIMIT_EXCEEDED');
    }

    return { sections, visuals, warnings: [...new Set(warnings)] };
  } finally {
    if (usedOcr) await reportStage?.('ocr', true);

    try {
      await ocr.close();
      await ocr.waitForInitialization();
    } finally {
      if (usedOcr) await reportStage?.('ocr', false);
    }

    await pdf?.loadingTask.destroy();
    await OfficeParser.terminateOcr();
  }
}
