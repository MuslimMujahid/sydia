import { describe, expect, test } from '@jest/globals';
import {
  appendPlainText,
  indexSignature,
  parseRichTextDocument,
  plainTextToRichText,
  richTextToPlainText,
} from './document';

describe('rich text document parsing', () => {
  test('rejects a value that is not a document', () => {
    expect(parseRichTextDocument(null)).toBeNull();
    expect(parseRichTextDocument('doc')).toBeNull();
    expect(parseRichTextDocument({ type: 'paragraph' })).toBeNull();
  });

  test('rejects a document whose content is not a node list', () => {
    expect(parseRichTextDocument({ type: 'doc', content: {} })).toBeNull();
  });

  test('keeps unknown node types the editor may add later', () => {
    const document = parseRichTextDocument({
      type: 'doc',
      content: [{ type: 'someFutureNode', attrs: { level: 2 } }],
    });

    expect(document?.content).toHaveLength(1);
  });

  test('treats a document without content as an empty one', () => {
    expect(parseRichTextDocument({ type: 'doc' })?.content).toEqual([]);
  });
});

describe('rich text to plain text', () => {
  test('joins paragraphs with a line break and drops marks', () => {
    const text = richTextToPlainText({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Bryan', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' dan Salsa tidak hadir' },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Besok masuk' }] },
      ],
    });

    expect(text).toBe('Bryan dan Salsa tidak hadir\nBesok masuk');
  });

  test('renders a list item on its own line and keeps headings', () => {
    const text = richTextToPlainText({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'IPA' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Fotosintesis' }],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Respirasi' }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(text).toBe('IPA\nFotosintesis\n\nRespirasi');
  });

  test('returns empty text for an empty document', () => {
    expect(richTextToPlainText({ type: 'doc', content: [] })).toBe('');
  });

  test('stops walking a document nested past the depth guard', () => {
    let node: Parameters<typeof richTextToPlainText>[0]['content'][number] = {
      type: 'text',
      text: 'deep',
    };

    for (let depth = 0; depth < 40; depth += 1)
      node = { type: 'blockquote', content: [node] };

    expect(richTextToPlainText({ type: 'doc', content: [node] })).toBe('');
  });
});

describe('plain text to rich text', () => {
  test('makes one paragraph per line', () => {
    expect(plainTextToRichText('Baris satu\nBaris dua').content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Baris satu' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Baris dua' }] },
    ]);
  });

  test('collapses consecutive dash lines into one bullet list', () => {
    const document = plainTextToRichText('- Fotosintesis\n- Respirasi');

    expect(document.content).toEqual([
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Fotosintesis' }],
              },
            ],
          },
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Respirasi' }],
              },
            ],
          },
        ],
      },
    ]);
  });

  test('collapses numbered lines into one ordered list', () => {
    const document = plainTextToRichText('1. Satu\n2) Dua');

    expect(document.content[0]).toEqual({
      type: 'orderedList',
      content: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Satu' }] },
          ],
        },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Dua' }] },
          ],
        },
      ],
    });
  });

  test('does not make a blank line its own paragraph', () => {
    expect(plainTextToRichText('Satu\n\nDua').content).toHaveLength(2);
  });

  test('round-trips prose through plain text without loss', () => {
    const text = 'Bryan dan Salsa tidak hadir\nMateri IPA: fotosintesis';

    expect(richTextToPlainText(plainTextToRichText(text))).toBe(text);
  });
});

describe('appending to a document', () => {
  test('keeps the existing blocks and adds the new text after them', () => {
    const existing = plainTextToRichText('Catatan pagi');
    const merged = appendPlainText(existing, 'Catatan siang');

    expect(richTextToPlainText(merged)).toBe('Catatan pagi\nCatatan siang');
  });

  test('starts a document when the day has no note yet', () => {
    expect(
      richTextToPlainText(
        appendPlainText({ type: 'doc', content: [] }, 'Halo'),
      ),
    ).toBe('Halo');
  });
});

describe('index signature', () => {
  test('is stable for the same text so a repeat index is a no-op', () => {
    expect(indexSignature('sama')).toBe(indexSignature('sama'));
  });

  test('changes when the retrievable text changes', () => {
    expect(indexSignature('sebelum')).not.toBe(indexSignature('sesudah'));
  });
});
