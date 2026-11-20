import type { TopicSourceInvocation } from '../../database/entities';
import {
  messageAnchors,
  touchedItems,
  uniqueItems,
} from './topic-item-references';

const call = (
  name: string,
  result: unknown,
  args: unknown = {},
): TopicSourceInvocation => ({
  inputMessageId: 'message-1',
  name,
  arguments: args,
  result,
});

describe('touched topic items', () => {
  it('reads every reminder a create call made', () => {
    expect(
      touchedItems(
        call('create_reminder', { reminders: [{ id: 'r-1' }, { id: 'r-2' }] }),
      ),
    ).toEqual([
      { type: 'reminder', id: 'r-1' },
      { type: 'reminder', id: 'r-2' },
    ]);
  });

  it('reads wrapped single items only when the object type matches', () => {
    expect(
      touchedItems(
        call('create_calendar_event', {
          objectType: 'calendar_event',
          object: { id: 'e-1' },
        }),
      ),
    ).toEqual([{ type: 'calendar_event', id: 'e-1' }]);
    expect(
      touchedItems(
        call('update_task', { objectType: 'reminder', object: { id: 'x' } }),
      ),
    ).toEqual([]);
  });

  it('addresses notes by their custom and daily refs', () => {
    expect(touchedItems(call('read_custom_note', {}, { id: 'n-1' }))).toEqual([
      { type: 'note', id: 'custom:n-1' },
    ]);
    expect(
      touchedItems(call('create_custom_note', { kind: 'note', id: 'n-2' })),
    ).toEqual([{ type: 'note', id: 'custom:n-2' }]);
    expect(
      touchedItems(call('write_daily_note', { date: '2026-11-21' })),
    ).toEqual([{ type: 'note', id: 'daily:2026-11-21' }]);
    expect(
      touchedItems(call('add_record_rows', {}, { id: 'table-1' })),
    ).toEqual([{ type: 'note', id: 'custom:table-1' }]);
  });

  it('does not treat reading an empty day as an item', () => {
    expect(
      touchedItems(
        call('read_daily_note', { date: '2026-11-21', found: false }),
      ),
    ).toEqual([]);
  });

  it('ignores deletions, searches, secrets and malformed ids', () => {
    expect(touchedItems(call('delete_reminder', { id: 'r-1' }))).toEqual([]);
    expect(
      touchedItems(call('search_notes', { notes: [{ id: 'n' }] })),
    ).toEqual([]);
    expect(
      touchedItems(
        call('store_secret', { objectType: 'secret', object: { id: 's' } }),
      ),
    ).toEqual([]);
    expect(
      touchedItems(call('create_reminder', { reminders: [{ id: 42 }] })),
    ).toEqual([]);
  });
});

describe('message anchors', () => {
  it('collects the open note, selected notes and selected files', () => {
    expect(
      messageAnchors({
        id: 'm',
        role: 'user',
        content: 'x',
        createdAt: new Date(0),
        activeNoteRef: 'custom:open',
        sourceNoteRefs: ['daily:2026-11-20'],
        sourceDocumentIds: ['doc-1'],
      }),
    ).toEqual([
      { type: 'note', id: 'custom:open' },
      { type: 'note', id: 'daily:2026-11-20' },
      { type: 'document', id: 'doc-1' },
    ]);
  });

  it('deduplicates refs in first-seen order', () => {
    expect(
      uniqueItems([
        { type: 'task', id: 't' },
        { type: 'note', id: 't' },
        { type: 'task', id: 't' },
      ]),
    ).toEqual([
      { type: 'task', id: 't' },
      { type: 'note', id: 't' },
    ]);
  });
});
