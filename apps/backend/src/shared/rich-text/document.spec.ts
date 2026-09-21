import { describe, expect, test } from '@jest/globals';
import {
  appendPlainText,
  indexSignature,
  parseRichTextDocument,
  plainTextToRichText,
  richTextToMarkedText,
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

  test('turns a Markdown heading line into a real heading node', () => {
    expect(plainTextToRichText('## Kehadiran').content).toEqual([
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Kehadiran' }],
      },
    ]);
  });

  test('clamps a heading to the levels the editor renders', () => {
    expect(plainTextToRichText('##### Terlalu dalam').content).toEqual([
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Terlalu dalam' }],
      },
    ]);
  });

  test('starts a new list under a heading instead of continuing the last one', () => {
    const document = plainTextToRichText(
      '- Fotosintesis\n## Tugas\n- PR halaman 20',
    );

    const [first, heading, second] = document.content;

    expect(document.content).toHaveLength(3);
    expect(first).toMatchObject({ type: 'bulletList' });
    expect(heading).toMatchObject({ type: 'heading', attrs: { level: 2 } });
    expect(second).toMatchObject({ type: 'bulletList' });
  });

  test('drops heading and list markers from the retrievable text', () => {
    expect(
      richTextToPlainText(plainTextToRichText('# Kehadiran\n- Bryan hadir')),
    ).toBe('Kehadiran\nBryan hadir');
  });

  test('keeps headings and lists when a note is read and written back', () => {
    const text =
      '## Kehadiran\n- Bryan hadir\n- Salsa izin\n\nMateri IPA: fotosintesis';

    const once = richTextToMarkedText(plainTextToRichText(text));

    // A blank separator line is not a document node, so it is normalized away;
    // the headings and list items must survive it.
    expect(once).toBe(
      '## Kehadiran\n- Bryan hadir\n- Salsa izin\nMateri IPA: fotosintesis',
    );
    // The decisive property: the text the assistant reads back re-parses to
    // exactly the stored structure, so a read-then-replace edit cannot flatten
    // a heading or a list into plain paragraphs.
    expect(plainTextToRichText(once).content).toEqual(
      plainTextToRichText(text).content,
    );
  });

  test('renumbers an ordered list so a read then rewrite keeps it valid', () => {
    const document = plainTextToRichText('1. Satu\n1. Dua\n1. Tiga');

    expect(richTextToMarkedText(document)).toBe('1. Satu\n2. Dua\n3. Tiga');
  });

  test('keeps headings readable when the note has no list', () => {
    expect(richTextToMarkedText(plainTextToRichText('## Tugas'))).toBe(
      '## Tugas',
    );
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
