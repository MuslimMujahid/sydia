import { describe, expect, jest, test } from '@jest/globals';
import type { DailyNote } from '../../../database/entities';
import {
  plainTextToRichText,
  richTextToMarkedText,
} from '../../../shared/rich-text';
import type { DailyNoteService } from '../../daily-notes/daily-note.service';
import { createDailyNoteTools } from './daily-note-tools';

const NOTE_DATE = '2026-09-20';

function note(overrides: Partial<DailyNote> = {}): DailyNote {
  const text = overrides.text ?? 'Bryan dan Salsa tidak hadir';

  return {
    id: 'note-1',
    date: NOTE_DATE,
    content: plainTextToRichText(text),
    text,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    source: { type: 'dashboard', label: null },
    ...overrides,
  };
}

/**
 * The tools are exercised through their public callable interface. A minimal
 * service stand-in records what the tool asks the diary to store, which is what
 * the note's reader later observes.
 */
function service(options: { existing?: DailyNote | null } = {}) {
  const save = jest
    .fn<DailyNoteService['save']>()
    .mockImplementation((_userId, input) =>
      Promise.resolve(
        note({
          date: input.date,
          text: richTextToMarkedText(input.document),
          content: input.document,
        }),
      ),
    );

  const append = jest.fn(() => Promise.resolve(note()));
  const today = jest
    .fn<DailyNoteService['today']>()
    .mockResolvedValue('2026-09-21');

  const findByDate = jest
    .fn<DailyNoteService['findByDate']>()
    .mockResolvedValue(options.existing ?? null);

  return {
    dailyNotes: {
      save,
      append,
      today,
      findByDate,
    } as unknown as DailyNoteService,
    save,
    append,
    today,
  };
}

describe('daily note assistant tools', () => {
  test('accepts the complete note text and a date, with no mode', () => {
    const { dailyNotes } = service();
    const definition = createDailyNoteTools({ dailyNotes }).find(
      (tool) => tool.definition.name === 'write_daily_note',
    )?.definition;

    expect(definition?.name).toBe('write_daily_note');
    expect(definition?.parameters).toMatchObject({
      type: 'object',
      required: ['text'],
      additionalProperties: false,
    });

    const properties = definition?.parameters.properties ?? {};
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining(['text', 'date']),
    );
    expect(properties).not.toHaveProperty('mode');
  });

  test('reports the saved day and note without a mode', async () => {
    const { dailyNotes } = service();
    const text = '## Absensi\n- Bryan hadir';
    const write = createDailyNoteTools({ dailyNotes }).find(
      (tool) => tool.definition.name === 'write_daily_note',
    );

    const result = await write?.execute({
      userId: 'user-1',
      sourceMessageId: 'message-1',
      idempotencyKey: 'one',
      arguments: { text, date: NOTE_DATE },
    });

    expect(result).toEqual({
      date: NOTE_DATE,
      written: text,
      noteId: 'note-1',
    });
    expect(result).not.toHaveProperty('mode');
  });

  test('stores the whole note as rich text instead of appending to the day', async () => {
    const { dailyNotes, save, append } = service();
    const groups = [
      '## Absensi',
      '- Bryan hadir',
      '- Salsa izin',
      '## Materi',
      '- IPA bab 3',
    ];

    const text = groups.join('\n');
    const write = createDailyNoteTools({ dailyNotes }).find(
      (tool) => tool.definition.name === 'write_daily_note',
    );

    await write?.execute({
      userId: 'user-1',
      sourceMessageId: 'message-1',
      idempotencyKey: 'one',
      arguments: { text, date: NOTE_DATE },
    });

    expect(append).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);

    const written = save.mock.calls[0]?.[1];
    expect(written).toMatchObject({
      date: NOTE_DATE,
      sourceType: 'chat',
      sourceMessageId: 'message-1',
    });

    // Reading the stored day back returns the text that was sent, with its
    // headings and lists intact and nothing duplicated: the note is replaced.
    expect(richTextToMarkedText(written!.document)).toBe(groups.join('\n'));
  });

  test('keeps the earlier entry when a complete edited note is written over it', async () => {
    const current = '## Absensi\n- Bryan hadir';
    const { dailyNotes, save, append } = service({
      existing: note({ text: current, content: plainTextToRichText(current) }),
    });

    const tools = createDailyNoteTools({ dailyNotes });
    const read = tools.find(
      (tool) => tool.definition.name === 'read_daily_note',
    );

    const write = tools.find(
      (tool) => tool.definition.name === 'write_daily_note',
    );

    const opened = await read?.execute({
      userId: 'user-1',
      sourceMessageId: 'message-1',
      idempotencyKey: 'one',
      arguments: { date: NOTE_DATE },
    });

    expect(opened).toEqual(
      expect.objectContaining({ date: NOTE_DATE, found: true, text: current }),
    );

    const edited = `${current}\n- Salsa izin`;

    await write?.execute({
      userId: 'user-1',
      sourceMessageId: 'message-2',
      idempotencyKey: 'two',
      arguments: { text: edited, date: NOTE_DATE },
    });

    expect(append).not.toHaveBeenCalled();
    expect(richTextToMarkedText(save.mock.calls[0]![1].document)).toBe(
      '## Absensi\n- Bryan hadir\n- Salsa izin',
    );
  });

  test('defaults the day to the owner’s today', async () => {
    const { dailyNotes, save, today } = service();
    const write = createDailyNoteTools({ dailyNotes }).find(
      (tool) => tool.definition.name === 'write_daily_note',
    );

    await write?.execute({
      userId: 'user-1',
      sourceMessageId: 'message-1',
      idempotencyKey: 'one',
      arguments: { text: 'Bryan hadir' },
    });

    expect(today).toHaveBeenCalledWith('user-1');
    expect(save.mock.calls[0]?.[1].date).toBe('2026-09-21');
  });

  test('rejects a call without note text', async () => {
    const { dailyNotes, save } = service();
    const write = createDailyNoteTools({ dailyNotes }).find(
      (tool) => tool.definition.name === 'write_daily_note',
    );

    await expect(
      write?.execute({
        userId: 'user-1',
        sourceMessageId: 'message-1',
        idempotencyKey: 'one',
        arguments: { date: NOTE_DATE },
      }),
    ).rejects.toThrow('text must be text.');

    expect(save).not.toHaveBeenCalled();
  });
});
