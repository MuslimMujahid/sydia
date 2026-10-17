import { Prisma } from '../../generated/prisma/client';
import {
  assertLibraryUnlocked,
  libraryUnavailable,
} from '../entities/file-library.entity';

/** Every Files structural write takes this lock, including document ingestion. */
export async function lockFileLibrary(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`files:${userId}`}, 0))::text`,
  );
}

export async function requireWritableFileFolder(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
) {
  const row = await tx.fileFolder.findFirst({ where: { userId, id } });
  if (!row) libraryUnavailable();
  assertLibraryUnlocked(row.deletingOperationId);

  return row;
}
