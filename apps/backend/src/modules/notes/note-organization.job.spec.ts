import { describe, expect, test } from '@jest/globals';
import type { NoteOrganizationJob } from '../../infra/queue';
import { processNoteOrganizationJob } from './note-organization.job';

describe('Note organization job scope', () => {
  test.each([
    { job: { kind: 'recover' } as NoteOrganizationJob, owner: undefined },
    {
      job: { kind: 'user', userId: 'owner-a' } as NoteOrganizationJob,
      owner: 'owner-a',
    },
  ])(
    'valid jobs preserve their requested recovery scope: $job.kind',
    async ({ job, owner }) => {
      const owners: Array<string | undefined> = [];
      const organizer = {
        recover: (userId?: string) => {
          owners.push(userId);

          return Promise.resolve({ inspected: 1, mode: 'proposal' as const });
        },
      };

      expect(await processNoteOrganizationJob(organizer, job)).toEqual({
        inspected: 1,
        mode: 'proposal',
      });
      expect(owners).toEqual([owner]);
    },
  );

  test.each([
    { kind: 'user' },
    { kind: 'user', userId: '' },
    { kind: 'user', userId: '   ' },
    { kind: 'user', userId: 42 },
    { kind: 'unexpected' },
  ])('malformed queue data cannot trigger global recovery: %j', (data) => {
    let calls = 0;
    const organizer = {
      recover: () => {
        calls += 1;

        return Promise.resolve({ inspected: 0, mode: 'proposal' as const });
      },
    };

    expect(() =>
      processNoteOrganizationJob(
        organizer,
        data as unknown as NoteOrganizationJob,
      ),
    ).toThrow('valid kind and owner');
    expect(calls).toBe(0);
  });
});
