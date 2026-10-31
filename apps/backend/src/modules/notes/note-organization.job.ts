import { Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { NoteOrganizationJob } from '../../infra/queue';

export function processNoteOrganizationJob(
  organizer: { recover(userId?: string): Promise<unknown> },
  job: NoteOrganizationJob,
) {
  if (job.kind === 'recover') return organizer.recover();
  if (
    job.kind === 'user' &&
    typeof job.userId === 'string' &&
    job.userId.trim()
  )
    return organizer.recover(job.userId);

  Logger.error(
    'Rejected malformed note organization job; no owner or global recovery was run.',
    'NoteOrganizationWorker',
  );
  throw new Error('Note organization job requires a valid kind and owner.');
}

export async function registerNoteOrganizationRecovery(
  queue: Queue<NoteOrganizationJob>,
) {
  await queue.upsertJobScheduler(
    'note-organization-recovery',
    { every: 24 * 60 * 60_000 },
    { name: 'recover', data: { kind: 'recover' } },
  );
  await queue.upsertJobScheduler(
    'note-organization-pending',
    { every: 60_000 },
    { name: 'recover', data: { kind: 'recover' } },
  );
}
