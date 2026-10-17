import type {
  Message,
  RichBlock,
  RichBlockCaption,
  RichText,
} from 'grammy/types';

function richText(value: RichText): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(richText).join('');

  switch (value.type) {
    case 'custom_emoji':
      return value.alternative_text;
    case 'mathematical_expression':
      return value.expression;
    case 'anchor':
      return ''; // Anchors have no visible text.
    case 'button':
      return richText(value.button.text);
    default:
      return richText(value.text);
  }
}

function captionText(caption: RichBlockCaption | undefined): string {
  if (!caption) return '';

  return [
    richText(caption.text),
    caption.credit ? richText(caption.credit) : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function richBlocks(blocks: RichBlock[]): string {
  return blocks
    .map((block): string => {
      switch (block.type) {
        case 'paragraph':
        case 'heading':
        case 'pre':
        case 'footer':
        case 'thinking':
          return richText(block.text);
        case 'pullquote':
        case 'expandable_blockquote':
          return [
            richText(block.text),
            block.credit ? richText(block.credit) : '',
          ]
            .filter(Boolean)
            .join('\n');
        case 'list':
          return block.items
            .map((item) => `${item.label} ${richBlocks(item.blocks)}`)
            .join('\n');
        case 'blockquote':
          return [
            richBlocks(block.blocks),
            block.credit ? richText(block.credit) : '',
          ]
            .filter(Boolean)
            .join('\n');
        case 'details':
          return [richText(block.summary), richBlocks(block.blocks)]
            .filter(Boolean)
            .join('\n');
        case 'collage':
        case 'slideshow':
          return [richBlocks(block.blocks), captionText(block.caption)]
            .filter(Boolean)
            .join('\n');
        case 'table':
          return [
            ...block.cells.map((row) =>
              row
                .map((cell) =>
                  cell.text === undefined ? '' : richText(cell.text),
                )
                .join(' | '),
            ),
            block.caption ? richText(block.caption) : '',
          ]
            .filter(Boolean)
            .join('\n');
        case 'map':
        case 'animation':
        case 'audio':
        case 'document':
        case 'photo':
        case 'video':
        case 'voice_note':
          return captionText(block.caption);
        case 'buttons':
          return block.buttons
            .map((button) => richText(button.text))
            .join(' | ');
        case 'mathematical_expression':
          return block.expression;
        case 'divider':
        case 'anchor':
          return ''; // No visible text.

        default: {
          const unsupported: never = block;
          throw new Error(
            `Unsupported Telegram rich block: ${JSON.stringify(unsupported)}`,
          );
        }
      }
    })
    .filter(Boolean)
    .join('\n');
}

/** Rich messages carry their content in blocks rather than text or caption. */
export function telegramMessageText(
  message: Pick<Message, 'text' | 'caption' | 'rich_message'>,
): string {
  if (message.text?.trim()) return message.text;
  if (message.caption?.trim()) return message.caption;

  return message.rich_message ? richBlocks(message.rich_message.blocks) : '';
}
