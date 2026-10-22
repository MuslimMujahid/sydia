import { describe, expect, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { DocumentParserSettings } from './document-parser.config';
import { DocumentParserService } from './document-parser.service';

describe('DocumentParserService lifecycle', () => {
  test('does not start a new subprocess after shutdown', async () => {
    const service = new DocumentParserService(
      new DocumentParserSettings(new ConfigService({})),
    );

    await service.onModuleDestroy();
    await expect(
      service.parse({
        originalname: 'invoice.txt',
        mimetype: 'text/plain',
        buffer: Buffer.from('Invoice SYD-12345'),
      }),
    ).rejects.toMatchObject({
      code: 'PARSER_PROCESS_STOPPED',
      retryable: true,
    });
  });

  test('rejects empty and oversized files before preparing OCR assets', async () => {
    const service = new DocumentParserService(
      new DocumentParserSettings(
        new ConfigService({
          BACKEND_DOCUMENT_OCR_LANG_PATH: '/missing/ocr-assets',
        }),
      ),
    );

    try {
      await expect(
        service.parse({
          originalname: 'empty.txt',
          mimetype: 'text/plain',
          buffer: Buffer.alloc(0),
        }),
      ).rejects.toMatchObject({ code: 'EMPTY_DOCUMENT' });
      await expect(
        service.parse({
          originalname: 'huge.txt',
          mimetype: 'text/plain',
          buffer: Buffer.alloc(100_000_000 + 1),
        }),
      ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    } finally {
      await service.onModuleDestroy();
    }
  });
});
