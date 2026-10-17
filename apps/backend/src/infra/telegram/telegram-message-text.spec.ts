import type { RichMessage } from 'grammy/types';
import { telegramMessageText } from './telegram-message-text';

const cases: { name: string; rich_message: RichMessage; expected: string }[] = [
  {
    name: 'nested lists and formatting',
    rich_message: {
      blocks: [
        {
          type: 'list',
          items: [
            {
              label: '1.',
              blocks: [
                {
                  type: 'paragraph',
                  text: [
                    { type: 'bold', text: { type: 'italic', text: 'Review' } },
                    ' report',
                  ],
                },
                {
                  type: 'list',
                  items: [
                    {
                      label: '•',
                      blocks: [{ type: 'paragraph', text: 'Appendix' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    expected: '1. Review report\n• Appendix',
  },
  {
    name: 'collapsed details and quotations',
    rich_message: {
      blocks: [
        {
          type: 'details',
          summary: 'Tasks',
          blocks: [
            {
              type: 'blockquote',
              blocks: [{ type: 'paragraph', text: 'Read chapter' }],
              credit: 'Study',
            },
          ],
        },
      ],
    },
    expected: 'Tasks\nRead chapter\nStudy',
  },
  {
    name: 'table cell boundaries',
    rich_message: {
      blocks: [
        {
          type: 'table',
          cells: [
            [
              {
                text: { type: 'bold', text: 'Write summary' },
                align: 'left',
                valign: 'top',
              },
              { text: 'Tomorrow', align: 'left', valign: 'top' },
            ],
          ],
          caption: 'Upcoming work',
        },
      ],
    },
    expected: 'Write summary | Tomorrow\nUpcoming work',
  },
  {
    name: 'media captions',
    rich_message: {
      blocks: [
        {
          type: 'photo',
          photo: [],
          caption: {
            text: { type: 'bold', text: 'Prepare slides' },
            credit: 'Work',
          },
        },
      ],
    },
    expected: 'Prepare slides\nWork',
  },
  {
    name: 'inline emoji and mathematical expressions',
    rich_message: {
      blocks: [
        {
          type: 'paragraph',
          text: [
            {
              type: 'custom_emoji',
              custom_emoji_id: '1',
              alternative_text: '📚',
            },
            ' Study ',
            { type: 'mathematical_expression', expression: 'x^2' },
          ],
        },
      ],
    },
    expected: '📚 Study x^2',
  },
];

describe('Telegram rich message text', () => {
  it.each(cases)(
    'preserves visible text from $name',
    ({ rich_message, expected }) => {
      expect(telegramMessageText({ rich_message })).toBe(expected);
    },
  );

  it('keeps an empty non-text reference empty so the channel can request clarification', () => {
    expect(telegramMessageText({})).toBe('');
  });
});
