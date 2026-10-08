import { describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import {
  DocumentParserService,
  DocumentParserSettings,
  type ParsedDocument,
} from '../../infra/document-parser';
import { OpenRouterMediaService } from '../../infra/model-gateway';
import { StorageReadLimitError, StorageService } from '../../infra/storage';
import {
  DocumentExtractionService,
  extractionKey,
} from './document-extraction.service';

const file = {
  originalname: 'invoice.pdf',
  mimetype: 'application/pdf',
  buffer: Buffer.from('source document bytes'),
};

const key = 'tenant-a/documents/invoice.pdf';

function setup(visual = false) {
  const objects = new Map<string, Buffer>();
  const settings = new DocumentParserSettings(new ConfigService({}));

  const parse = jest
    .fn<DocumentParserService['parse']>()
    .mockImplementation((): Promise<ParsedDocument> =>
      Promise.resolve({
        sections: [
          {
            label: 'Page 2',
            pageNumber: 2,
            text: 'Invoice SYD-12345 Total Rp 125.000',
            chunks: ['[Page 2]\nInvoice SYD-12345 Total Rp 125.000'],
            methods: ['native'],
          },
        ],
        visuals: visual
          ? [
              {
                sectionIndex: 0,
                label: 'Page 2',
                mimeType: 'image/png',
                buffer: Buffer.from('fixture image'),
                reason: 'visual',
              },
            ]
          : [],
        warnings: [],
      }),
    );

  const interpretDocumentImage = jest
    .fn<OpenRouterMediaService['interpretDocumentImage']>()
    .mockResolvedValue('Chart: revenue rose from 100 to 200.');

  const get = jest
    .fn<StorageService['get']>()
    .mockImplementation((storageKey) => {
      const result = objects.get(storageKey);
      if (!result)
        return Promise.reject(
          Object.assign(new Error('missing'), { code: 'ENOENT' }),
        );

      return Promise.resolve(result);
    });

  const put = jest
    .fn<StorageService['put']>()
    .mockImplementation((storageKey, bytes) => {
      objects.set(storageKey, bytes);

      return Promise.resolve();
    });

  const remove = jest
    .fn<StorageService['delete']>()
    .mockImplementation((storageKey) => {
      objects.delete(storageKey);

      return Promise.resolve();
    });

  const service = new DocumentExtractionService(
    { parse, settings } as unknown as DocumentParserService,
    { interpretDocumentImage } as unknown as OpenRouterMediaService,
    { get, put, delete: remove } as unknown as StorageService,
  );

  return { service, objects, parse, interpretDocumentImage, get, put, remove };
}

describe('DocumentExtractionService', () => {
  test('regenerates an oversized checkpoint without allowing an unbounded storage read', async () => {
    const runtime = setup();
    runtime.get.mockRejectedValueOnce(new StorageReadLimitError());
    await runtime.service.extract(file, key);
    expect(runtime.get).toHaveBeenCalledWith(
      extractionKey(key),
      runtime.service.settings.limits.maxTextChars * 8,
    );
    expect(runtime.parse).toHaveBeenCalledTimes(1);
  });
  test('persists extraction and page references before returning, then reuses it without parsing or vision', async () => {
    const runtime = setup(true);
    const first = await runtime.service.extract(file, key);
    expect(first.chunks.every((chunk) => chunk.pageNumber === 2)).toBe(true);
    expect(first.text).toContain('[Vision interpretation: Page 2]');
    expect(first.methods).toEqual(['native', 'vision']);
    expect(runtime.objects.has(extractionKey(key))).toBe(true);
    expect(await runtime.service.extract(file, key)).toEqual(first);
    expect(runtime.parse).toHaveBeenCalledTimes(1);
    expect(runtime.interpretDocumentImage).toHaveBeenCalledTimes(1);
  });

  test.each([
    'checksum',
    'parserVersion',
    'policyVersion',
    'pageNumber',
    'chunkIndex',
    'content',
    'json',
  ])('regenerates invalid cached %s', async (field) => {
    const runtime = setup();
    await runtime.service.extract(file, key);
    const checkpoint = JSON.parse(
      runtime.objects.get(extractionKey(key))!.toString(),
    ) as {
      checksum: string;
      parserVersion: string;
      policyVersion: number;
      result: {
        chunks: Array<{
          pageNumber: number;
          chunkIndex: number;
          content: string;
        }>;
      };
    };

    if (field === 'checksum') checkpoint.checksum = 'different';
    if (field === 'parserVersion') checkpoint.parserVersion = 'obsolete';
    if (field === 'policyVersion') checkpoint.policyVersion = 2;
    if (field === 'pageNumber') checkpoint.result.chunks[0]!.pageNumber = -1;
    if (field === 'chunkIndex') checkpoint.result.chunks[0]!.chunkIndex = 5;
    if (field === 'content') checkpoint.result.chunks[0]!.content = '';
    runtime.objects.set(
      extractionKey(key),
      Buffer.from(field === 'json' ? '{broken' : JSON.stringify(checkpoint)),
    );
    await runtime.service.extract(file, key);
    expect(runtime.parse).toHaveBeenCalledTimes(2);
  });

  test('does not reuse another tenant checkpoint', async () => {
    const runtime = setup();
    await runtime.service.extract(file, key);
    await runtime.service.extract(file, 'tenant-b/documents/invoice.pdf');
    expect(runtime.parse).toHaveBeenCalledTimes(2);
  });

  test('requires vision for visual content and does not persist a partial result', async () => {
    const runtime = setup(true);
    runtime.interpretDocumentImage.mockResolvedValue(null);
    await expect(runtime.service.extract(file, key)).rejects.toMatchObject({
      code: 'VISION_NOT_CONFIGURED',
    });
    expect(runtime.put).not.toHaveBeenCalled();
  });

  test('does not duplicate an identical vision transcription', async () => {
    const runtime = setup(true);
    runtime.interpretDocumentImage.mockResolvedValue(
      'Invoice SYD-12345 Total Rp 125.000',
    );
    const result = await runtime.service.extract(file, key);
    expect(result.chunks).toHaveLength(1);
  });

  test.each(['[unreadable]', '[UNREADABLE]\n[unreadable]', '...'])(
    'rejects vision output without readable facts: %s',
    async (description) => {
      const runtime = setup(true);
      runtime.interpretDocumentImage.mockResolvedValue(description);
      await expect(runtime.service.extract(file, key)).rejects.toMatchObject({
        code: 'VISION_UNREADABLE',
        retryable: false,
      });
      expect(runtime.put).not.toHaveBeenCalled();
    },
  );

  test('keeps readable facts beside unreadable regions', async () => {
    const runtime = setup(true);
    runtime.interpretDocumentImage.mockResolvedValue(
      'Total Rp 125.000; signature [unreadable].',
    );
    const result = await runtime.service.extract(file, key);
    expect(result.text).toContain('Total Rp 125.000; signature [unreadable].');
    expect(runtime.put).toHaveBeenCalledTimes(1);
  });

  test('propagates storage outages instead of rerunning paid extraction', async () => {
    const runtime = setup(true);
    runtime.get.mockRejectedValue(new Error('storage unavailable'));
    await expect(runtime.service.extract(file, key)).rejects.toThrow(
      'storage unavailable',
    );
    expect(runtime.parse).not.toHaveBeenCalled();
  });

  test('propagates checkpoint write failures and removes derived artifacts on deletion', async () => {
    const runtime = setup();
    runtime.put.mockRejectedValueOnce(new Error('write failed'));
    await expect(runtime.service.extract(file, key)).rejects.toThrow(
      'write failed',
    );
    await runtime.service.extract(file, key);
    await runtime.service.deleteCheckpoint(key);
    expect(runtime.objects.has(extractionKey(key))).toBe(false);
    expect(runtime.remove).toHaveBeenCalledWith(extractionKey(key));
  });
});
