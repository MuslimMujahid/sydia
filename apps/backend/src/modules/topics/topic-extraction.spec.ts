import { parseTopicExtraction } from './topic-extraction';

const bounds = { items: 2, userMessages: 1 };
const parse = (value: unknown) =>
  parseTopicExtraction(JSON.stringify(value), bounds);

describe('topic extraction parsing', () => {
  it('reads a complete answer', () => {
    expect(
      parse({
        action: 'existing',
        topicId: 't-1',
        label: null,
        aliases: ['karyawisata'],
        linkedItems: [1],
        claims: [
          {
            kind: 'decision',
            text: 'Iuran sudah dibayar',
            explicit: true,
            messageIndex: 0,
          },
        ],
      }),
    ).toEqual({
      action: 'existing',
      topicId: 't-1',
      label: null,
      aliases: ['karyawisata'],
      linkedItems: [1],
      claims: [
        {
          kind: 'decision',
          text: 'Iuran sudah dibayar',
          explicit: true,
          messageIndex: 0,
        },
      ],
    });
  });

  it('infers an omitted action from the topic or label the answer names', () => {
    expect(parse({ topicId: 't-1' })).toMatchObject({ action: 'existing' });
    expect(parse({ label: 'Renovasi dapur' })).toMatchObject({ action: 'new' });
    expect(parse({ aliases: [] })).toEqual({ action: 'none' });
  });

  it('treats an inconsistent answer as none instead of guessing', () => {
    expect(parse({ action: 'existing', topicId: null })).toEqual({
      action: 'none',
    });
    expect(parse({ action: 'new', label: '   ' })).toEqual({ action: 'none' });
  });

  it('drops claims and items that point outside the conversation', () => {
    const result = parse({
      action: 'new',
      label: 'Study tour',
      linkedItems: [0, 2, -1, 0, 1.5],
      claims: [
        { kind: 'decision', text: 'ok', explicit: true, messageIndex: 1 },
        { kind: 'opinion', text: 'x', explicit: true, messageIndex: 0 },
        { text: 'no kind', explicit: true, messageIndex: 0 },
        {
          kind: 'next_step',
          text: 'Bayar Jumat',
          explicit: false,
          messageIndex: 0,
        },
      ],
    });

    expect(result).toMatchObject({
      linkedItems: [0],
      claims: [{ kind: 'next_step', text: 'Bayar Jumat', messageIndex: 0 }],
    });
  });

  it('fails loudly on output that is not JSON, so the job retries', () => {
    expect(() => parseTopicExtraction('not json', bounds)).toThrow('not JSON');
  });
});
