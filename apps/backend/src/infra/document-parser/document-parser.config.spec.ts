import { describe, expect, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import {
  DocumentParserSettings,
  validateDocumentParserEnvironment,
} from './document-parser.config';

describe('document parser settings', () => {
  test('uses bounded extraction defaults without a parser selector', () => {
    const settings = new DocumentParserSettings(new ConfigService({}));

    expect(settings.limits.timeoutMs).toBe(60_000);
    expect(settings.limits.renderTimeoutMs).toBe(10_000);
    expect(settings.limits.maxPages).toBe(100);
  });

  test('accepts custom limits and a local language path', () => {
    const settings = new DocumentParserSettings(
      new ConfigService({
        BACKEND_DOCUMENT_MAX_PAGES: '20',
        BACKEND_DOCUMENT_OCR_LANG_PATH: ' /opt/ocr ',
      }),
    );

    expect(settings.limits.maxPages).toBe(20);
    expect(settings.limits.ocrLangPath).toBe('/opt/ocr');
  });

  test.each([
    0,
    -1,
    1001,
    1.5,
    'not a number',
    true,
    [1],
    { valueOf: () => 1 },
  ])('rejects invalid page limit %p', (value) => {
    expect(() =>
      validateDocumentParserEnvironment({ BACKEND_DOCUMENT_MAX_PAGES: value }),
    ).toThrow('BACKEND_DOCUMENT_MAX_PAGES');
  });

  test.each([
    'http://example.com',
    ' https://example.com ',
    'ftp://example.com',
    'file:///opt/ocr',
    42,
  ])('rejects nonlocal OCR asset setting %p', (value) => {
    expect(() =>
      validateDocumentParserEnvironment({
        BACKEND_DOCUMENT_OCR_LANG_PATH: value,
      }),
    ).toThrow('local directory');
  });

  test('rejects out-of-budget deadlines', () => {
    expect(() =>
      validateDocumentParserEnvironment({
        BACKEND_DOCUMENT_TIMEOUT_MS: 120_000,
      }),
    ).toThrow('BACKEND_DOCUMENT_TIMEOUT_MS');
    expect(() =>
      validateDocumentParserEnvironment({
        BACKEND_DOCUMENT_OCR_TIMEOUT_MS: 60_000,
      }),
    ).toThrow('BACKEND_DOCUMENT_OCR_TIMEOUT_MS');
  });

  test.each([0, 999, 30_001, 1.5, true, 'not a number'])(
    'rejects invalid rendering deadline %p',
    (value) => {
      expect(() =>
        validateDocumentParserEnvironment({
          BACKEND_DOCUMENT_RENDER_TIMEOUT_MS: value,
        }),
      ).toThrow('BACKEND_DOCUMENT_RENDER_TIMEOUT_MS');
    },
  );
});
