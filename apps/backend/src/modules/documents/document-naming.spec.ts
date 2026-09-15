import { describe, expect, test } from '@jest/globals';
import {
  buildFallbackTitle,
  isUndescriptiveName,
  sanitizeDerivedTitle,
} from './document-naming';

describe('document naming', () => {
  test.each([
    'AQADkhRrG2a7SVV-.jpg',
    'IMG_4821.JPG',
    'd41d8cd98f00b204e9800998ecf8427e.pdf',
    '1730987654321.png',
    'telegram-778899.pdf',
    'file1.txt',
    'untitled',
  ])('recognizes machine-generated name %s', (name) => {
    expect(isUndescriptiveName(name)).toBe(true);
  });

  test.each([
    'Laporan Keuangan Q3.pdf',
    'thesis-draft-final.docx',
    'Catatan Rapat 2026-09-15.md',
    'Rencana.png',
  ])('preserves human name %s', (name) => {
    expect(isUndescriptiveName(name)).toBe(false);
  });

  test('sanitizes unsafe model output and preserves the original extension', () => {
    expect(
      sanitizeDerivedTitle('"../Laporan: Q3"', 'AQADkhRrG2a7SVV-.jpg'),
    ).toBe('Laporan Q3.jpg');
    expect(sanitizeDerivedTitle('   ', 'file.pdf')).toBeNull();
  });

  test('builds a deterministic Indonesian fallback with the original extension', () => {
    expect(
      buildFallbackTitle(
        'image',
        'AQADkhRrG2a7SVV-.jpg',
        new Date('2026-09-15T07:59:00.000Z'),
        'Asia/Jakarta',
      ),
    ).toMatch(/Gambar 15 Sep 2026, \d{2}\.\d{2}\.jpg/);
  });

  test('formats the same instant in the requested timezone', () => {
    const instant = new Date('2026-09-15T06:50:00.000Z');

    expect(
      buildFallbackTitle(
        'image',
        'AQADkhRrG2a7SVV-.jpg',
        instant,
        'Asia/Makassar',
      ),
    ).toBe('Gambar 15 Sep 2026, 14.50.jpg');
    expect(
      buildFallbackTitle('image', 'AQADkhRrG2a7SVV-.jpg', instant, 'UTC'),
    ).toBe('Gambar 15 Sep 2026, 06.50.jpg');
  });

  test('falls back to UTC for an invalid timezone', () => {
    expect(
      buildFallbackTitle(
        'image',
        'AQADkhRrG2a7SVV-.jpg',
        new Date('2026-09-15T06:50:00.000Z'),
        'Invalid/Timezone',
      ),
    ).toBe('Gambar 15 Sep 2026, 06.50.jpg');
  });
});
