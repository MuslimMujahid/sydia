import { jest } from '@jest/globals';
import type { NotesService } from '../../notes/notes.service';
import type { DailyNoteService } from '../../daily-notes/daily-note.service';
import { ActiveNoteService } from './active-note.service';

function setup() {
  const find = jest.fn<NotesService['find']>();
  const findByDate = jest
    .fn<DailyNoteService['findByDate']>()
    .mockResolvedValue(null);

  const service = new ActiveNoteService(
    { find } as unknown as NotesService,
    { findByDate } as unknown as DailyNoteService,
  );

  return { service, find, findByDate };
}

describe('message active-note validation', () => {
  it('validates custom identities against the effective owner', async () => {
    const { service, find } = setup();
    await service.validate('owner', 'custom:design');
    expect(find).toHaveBeenCalledWith('owner', 'design');
  });

  it('accepts an empty daily date without creating a note', async () => {
    const { service, find, findByDate } = setup();
    await expect(
      service.validate('owner', 'daily:2026-10-18'),
    ).resolves.toBeUndefined();
    expect(findByDate).toHaveBeenCalledWith('owner', '2026-10-18');
    expect(find).not.toHaveBeenCalled();
  });

  it('propagates an inaccessible custom-note failure without substituting a title', async () => {
    const { service, find } = setup();
    const failure = new Error('Not found');
    find.mockRejectedValue(failure);
    await expect(service.validate('other-owner', 'custom:design')).rejects.toBe(
      failure,
    );
  });

  it.each([
    'daily:2026-02-31',
    'custom:',
    'custom:a/b',
    'daily:2026-10-18T00:00:00Z',
  ])('rejects invalid reference %s', async (ref) => {
    const { service, find, findByDate } = setup();
    await expect(service.validate('owner', ref)).rejects.toThrow();
    expect(find).not.toHaveBeenCalled();
    expect(findByDate).not.toHaveBeenCalled();
  });
});
