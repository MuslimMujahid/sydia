import { describe, expect, test } from '@jest/globals';
import { fileFolderName } from './file-library.entity';

describe('file folder names', () => {
  test('normalizes Unicode and surrounding whitespace before comparing sibling names', () => {
    expect(fileFolderName('  Cafe\u0301  ')).toEqual({
      name: 'Café',
      normalizedName: 'café',
    });
  });
  test('preserves capitalization and internal spaces for display', () => {
    expect(fileFolderName('Project  Sydia')).toEqual({
      name: 'Project  Sydia',
      normalizedName: 'project  sydia',
    });
  });
  test('rejects a name that contains a path separator', () => {
    expect(() => fileFolderName('Work/Receipts')).toThrow('tanpa pemisah path');
  });
  test('rejects control characters even inside the name', () => {
    expect(() => fileFolderName('Work\nReceipts')).toThrow('karakter kontrol');
  });
  test('rejects an empty name after whitespace trimming', () => {
    expect(() => fileFolderName('  ')).toThrow('1–255 karakter');
  });
  test('counts Unicode code points rather than UTF-16 code units', () => {
    expect(fileFolderName('😀'.repeat(255)).name).toHaveLength(510);
  });
  test('rejects a name exceeding 255 Unicode code points', () => {
    expect(() => fileFolderName('a'.repeat(256))).toThrow('1–255 karakter');
  });
  test('rejects the parent-directory name', () => {
    expect(() => fileFolderName('..')).toThrow('1–255 karakter');
  });
});
