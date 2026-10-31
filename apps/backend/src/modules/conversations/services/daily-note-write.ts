import { HttpStatus } from '@nestjs/common';
import { ApiException, ErrorCodes } from '../../../shared/errors';
import { isDayKey } from '../../../database/entities';
import {
  noteReferences,
  parseRichTextDocument,
  plainTextToRichText,
  richTextToPlainText,
} from '../../../shared/rich-text';

/** Shared preparation for a provisional daily preview and its actual write. */
export function prepareDailyNoteWrite(
  input: Record<string, unknown>,
  defaultDate: string,
  current: { updatedAt: Date } | null,
) {
  if (typeof input.text !== 'string' || !input.text.trim())
    throw new Error('text must be text.');
  const text = input.text.trim();
  const requested = input.date === undefined ? defaultDate : input.date;
  const date = typeof requested === 'string' ? requested.trim() : requested;
  if (typeof date !== 'string' || !isDayKey(date))
    throw new Error('date must be a local calendar date in YYYY-MM-DD form.');
  const expected = input.expectedUpdatedAt;
  if (current && (typeof expected !== 'string' || input.document === undefined))
    throw new Error(
      'Read the current daily note first, then send document and expectedUpdatedAt to preserve its content and revision.',
    );
  if (
    expected !== undefined &&
    expected !== null &&
    (typeof expected !== 'string' || Number.isNaN(new Date(expected).getTime()))
  )
    throw new Error(
      'expectedUpdatedAt must be the exact timestamp returned by read_daily_note.',
    );
  const expectedUpdatedAt =
    typeof expected === 'string' ? new Date(expected) : null;

  if (
    (current?.updatedAt.getTime() ?? null) !==
    (expectedUpdatedAt?.getTime() ?? null)
  )
    throw new ApiException({
      code: ErrorCodes.CONFLICT,
      status: HttpStatus.CONFLICT,
      message:
        'Catatan telah berubah. Draf Anda tetap disimpan; pilih versi yang ingin digunakan.',
      details: { reason: 'REVISION' },
    });
  const document =
    input.document === undefined
      ? plainTextToRichText(text)
      : parseRichTextDocument(input.document);

  if (!document || !richTextToPlainText(document).trim())
    throw new Error(
      'A daily write requires a valid non-empty Tiptap document.',
    );
  noteReferences(document);

  return { date, text, document, expectedUpdatedAt };
}
