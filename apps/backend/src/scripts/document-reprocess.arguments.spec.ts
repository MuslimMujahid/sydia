import { describe, expect, test } from '@jest/globals';
import { parseReprocessingArguments } from './document-reprocess.arguments';

describe('document reprocessing arguments', () => {
  test('requires explicit owner/IDs and defaults to dry run with five serial files', () => {
    expect(
      parseReprocessingArguments([
        '--user-id',
        'owner',
        '--document-id',
        'b',
        '--document-id',
        'a',
      ]),
    ).toMatchObject({
      userId: 'owner',
      documentIds: ['b', 'a'],
      limit: 5,
      execute: false,
      refreshExtraction: false,
    });
  });
  test('accepts bounded execution and a cursor from the selection', () => {
    expect(
      parseReprocessingArguments([
        '--user-id',
        'owner',
        '--document-id',
        'a',
        '--after-id',
        'a',
        '--limit',
        '20',
        '--execute',
        '--refresh-extraction',
      ]),
    ).toMatchObject({
      limit: 20,
      execute: true,
      refreshExtraction: true,
      afterId: 'a',
    });
  });
  test.each(
    [
      [],
      ['--unknown'],
      ['--user-id'],
      ['--user-id', 'owner'],
      ['--user-id', 'owner', '--document-id', 'a', '--limit', '0'],
      ['--user-id', 'owner', '--document-id', 'a', '--limit', '21'],
      ['--user-id', 'owner', '--document-id', 'a', '--limit', '1.5'],
      ['--user-id', 'owner', '--document-id', 'a', '--after-id', 'missing'],
      ['--user-id', 'owner', '--user-id', 'other', '--document-id', 'a'],
    ].map((args) => ({ args })),
  )('rejects invalid arguments %p', ({ args }) => {
    expect(() => parseReprocessingArguments(args)).toThrow();
  });
});
