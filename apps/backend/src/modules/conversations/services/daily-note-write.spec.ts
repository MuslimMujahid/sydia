import { ErrorCodes } from '../../../shared/errors';
import { prepareDailyNoteWrite } from './daily-note-write';

const current = { updatedAt: new Date('2026-10-31T01:02:03.000Z') };
const document = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Recorded value', marks: [{ type: 'bold' }] },
      ],
    },
  ],
};

test('an explicit record date takes precedence over the processing day', () => {
  expect(
    prepareDailyNoteWrite(
      { text: 'Recorded value', date: '2026-10-29' },
      '2026-10-31',
      null,
    ),
  ).toMatchObject({ date: '2026-10-29', expectedUpdatedAt: null });
});

test('a missing date uses the supplied source-local day', () => {
  expect(
    prepareDailyNoteWrite({ text: 'Recorded value' }, '2026-10-29', null).date,
  ).toBe('2026-10-29');
});

test('an existing day requires its full document and revision', () => {
  expect(() =>
    prepareDailyNoteWrite({ text: 'Replacement' }, '2026-10-31', current),
  ).toThrow('document and expectedUpdatedAt');
});

test('an invalid timestamp cannot become a daily preview', () => {
  expect(() =>
    prepareDailyNoteWrite(
      { text: 'Replacement', document, expectedUpdatedAt: 'invalid' },
      '2026-10-31',
      current,
    ),
  ).toThrow('exact timestamp');
});

test('a stale timestamp cannot replace current daily content', async () => {
  await expect(
    Promise.resolve().then(() =>
      prepareDailyNoteWrite(
        {
          text: 'Replacement',
          document,
          expectedUpdatedAt: '2026-10-30T01:02:03.000Z',
        },
        '2026-10-31',
        current,
      ),
    ),
  ).rejects.toMatchObject({
    code: ErrorCodes.CONFLICT,
    response: { error: { details: { reason: 'REVISION' } } },
  });
});

test('a removed day cannot be recreated using an earlier revision', async () => {
  await expect(
    Promise.resolve().then(() =>
      prepareDailyNoteWrite(
        {
          text: 'Replacement',
          document,
          expectedUpdatedAt: '2026-10-30T01:02:03.000Z',
        },
        '2026-10-31',
        null,
      ),
    ),
  ).rejects.toMatchObject({
    code: ErrorCodes.CONFLICT,
    response: { error: { details: { reason: 'REVISION' } } },
  });
});

test('equivalent timestamp offsets identify the same revision', () => {
  expect(
    prepareDailyNoteWrite(
      {
        text: 'Recorded value',
        document,
        expectedUpdatedAt: '2026-10-31T09:02:03.000+08:00',
      },
      '2026-10-31',
      current,
    ),
  ).toMatchObject({
    document,
    expectedUpdatedAt: new Date('2026-10-31T01:02:03.000Z'),
  });
});

test('an invalid explicit date cannot silently use today', () => {
  expect(() =>
    prepareDailyNoteWrite(
      { text: 'Recorded value', date: '2026-02-30' },
      '2026-10-31',
      null,
    ),
  ).toThrow('local calendar date');
});

test('document content takes precedence over a plain-text fallback without losing marks', () => {
  expect(
    prepareDailyNoteWrite(
      { text: 'Plain fallback', document },
      '2026-10-31',
      null,
    ).document,
  ).toEqual(document);
});
