import { describe, expect, test } from '@jest/globals';
import { sanitizeDerivedTitle } from './document-naming';

describe('document naming', () => {
  test('sanitizes unsafe model output and preserves the original extension', () => {
    expect(
      sanitizeDerivedTitle('"../Laporan: Q3"', 'AQADkhRrG2a7SVV-.jpg'),
    ).toBe('Laporan Q3.jpg');
    expect(sanitizeDerivedTitle('   ', 'file.pdf')).toBeNull();
  });
});
