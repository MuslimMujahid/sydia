import { describe, expect, test } from '@jest/globals';
import { addedNoteLines, applyNoteDocumentPatch } from './note-document-patch';
import {
  plainTextToRichText,
  type RichTextDocument,
} from '../../shared/rich-text';

describe('Capture source lines', () => {
  test.each([
    [
      'a partial amount correction',
      'Total Rp55.000',
      'Total Rp65.000',
      ['Total Rp65.000'],
    ],
    [
      'an equal-valued additional entry',
      'Makan Rp20.000',
      'Makan Rp20.000\nMakan Rp20.000',
      ['Makan Rp20.000'],
    ],
    ['an unchanged document', 'Total Rp55.000', 'Total Rp55.000', []],
  ])('tracks %s', (_scenario, before, after, expected) => {
    expect(
      addedNoteLines(plainTextToRichText(before), plainTextToRichText(after)),
    ).toEqual(expected);
  });
});

describe('Minimal note edits', () => {
  test('a structural edit rejects malformed rich-text content', () => {
    const before = {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Baca' }],
    };

    expect(() =>
      applyNoteDocumentPatch(
        { type: 'doc', content: [before] },
        {
          append: '',
          replacements: [],
          blockReplacements: [
            {
              before: [before],
              after: [{ type: 'bulletList', content: 'invalid' }],
            },
          ],
        },
      ),
    ).toThrow('content must be an array');
  });

  test('a structural edit rejects an ambiguous current block sequence', () => {
    const before = {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Baca' }],
    };

    expect(() =>
      applyNoteDocumentPatch(
        { type: 'doc', content: [before, before] },
        {
          append: '',
          replacements: [],
          blockReplacements: [{ before: [before], after: [] }],
        },
      ),
    ).toThrow('exactly one current block sequence');
  });

  test('a structural edit preserves marks and link identities while turning paragraphs into a list', () => {
    const task = {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Baca', marks: [{ type: 'bold' }] }],
    };

    const unrelated = {
      type: 'paragraph',
      content: [
        {
          type: 'noteLink',
          attrs: { target: 'custom:reference', label: 'Referensi' },
        },
      ],
    };

    const list = {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [task] }],
    };

    expect(
      applyNoteDocumentPatch(
        { type: 'doc', content: [task, unrelated] },
        {
          append: '',
          replacements: [],
          blockReplacements: [
            {
              before: [{ content: task.content, type: task.type }],
              after: [list],
            },
          ],
        },
      ),
    ).toEqual({ type: 'doc', content: [list, unrelated] });
  });

  test('an equal-valued additional transaction remains distinct', () => {
    expect(
      applyNoteDocumentPatch(plainTextToRichText('Makan Rp20.000'), {
        append: 'Makan Rp20.000',
        replacements: [],
      }),
    ).toEqual(plainTextToRichText('Makan Rp20.000\nMakan Rp20.000'));
  });

  test('a correction and a separately requested equal-valued entry both survive', () => {
    const document = plainTextToRichText('Total pengeluaran Rp55.000');

    expect(
      applyNoteDocumentPatch(document, {
        replacements: [{ before: 'Rp55.000', after: 'Rp65.000' }],
        append: 'Total pengeluaran Rp65.000',
      }),
    ).toEqual(
      plainTextToRichText(
        'Total pengeluaran Rp65.000\nTotal pengeluaran Rp65.000',
      ),
    );
  });

  test('a correction preserves formatting and note-link identities', () => {
    const document: RichTextDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Total Rp55.000', marks: [{ type: 'bold' }] },
            {
              type: 'noteLink',
              attrs: { target: 'custom:expense', label: 'Pengeluaran' },
            },
          ],
        },
      ],
    };

    const edited = applyNoteDocumentPatch(document, {
      append: '',
      replacements: [{ before: 'Rp55.000', after: 'Rp65.000' }],
    });

    expect(edited).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Total Rp65.000', marks: [{ type: 'bold' }] },
            {
              type: 'noteLink',
              attrs: { target: 'custom:expense', label: 'Pengeluaran' },
            },
          ],
        },
      ],
    });
    expect(document.content).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Total Rp55.000', marks: [{ type: 'bold' }] },
          {
            type: 'noteLink',
            attrs: { target: 'custom:expense', label: 'Pengeluaran' },
          },
        ],
      },
    ]);
  });
  test('an ambiguous correction rejects the patch', () => {
    expect(() =>
      applyNoteDocumentPatch(
        {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Rp55.000 Rp55.000' }],
            },
          ],
        },
        {
          append: '',
          replacements: [{ before: 'Rp55.000', after: 'Rp65.000' }],
        },
      ),
    ).toThrow('exactly one');
  });
  test('an append keeps existing structure intact', () => {
    const heading = {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Kerja' }],
    };

    expect(
      applyNoteDocumentPatch(
        { type: 'doc', content: [heading] },
        { append: '- Belajar', replacements: [] },
      ),
    ).toEqual({
      type: 'doc',
      content: [
        heading,
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Belajar' }],
                },
              ],
            },
          ],
        },
      ],
    });
  });
});
