import { Prisma } from '../../generated/prisma/client';

export function rollbackSourceId(sourceKey: string | null): string | null {
  return sourceKey?.startsWith('rollback:')
    ? sourceKey.split(':')[1] || null
    : null;
}

/** Call only while holding the owner lock. Erases the connected local/remote source set. */
export async function withdrawConnectedMemorySources(
  tx: Prisma.TransactionClient,
  userId: string,
  initialSourceIds: string[],
  initialMessageIds: string[] = [],
  additionalMessageIds: string[] = [],
): Promise<void> {
  // Shared evidence can span corrections, shadow sources, and legacy copies.
  // Withdraw the whole connected set so another document cannot restore it.
  const evidence = new Set([...initialMessageIds, ...additionalMessageIds]);

  const sourceIds = new Set(initialSourceIds);
  const legacyIds = new Set<string>();
  let affected: Array<{
    id: string;
    bankId: string;
    sourceKey: string;
    legacyMemoryId: string | null;
    sourceMessageIds: string[];
  }> = [];

  let legacy: Array<{
    id: string;
    sourceMessageId: string | null;
    sourceMessageIds: string[];
    sourceKey: string | null;
  }> = [];

  while (true) {
    const previousSize = evidence.size + legacyIds.size + sourceIds.size;
    const messages = [...evidence];
    affected = await tx.hindsightSource.findMany({
      where: {
        bank: { userId },
        OR: [
          { id: { in: [...sourceIds] } },
          { sourceMessageIds: { hasSome: messages } },
          { legacyMemoryId: { in: [...legacyIds] } },
          { sourceKey: { in: [...legacyIds].map((id) => `legacy:${id}`) } },
        ],
      },
      select: {
        id: true,
        bankId: true,
        sourceKey: true,
        legacyMemoryId: true,
        sourceMessageIds: true,
      },
    });

    for (const item of affected) {
      sourceIds.add(item.id);
      item.sourceMessageIds.forEach((id) => evidence.add(id));
      if (item.legacyMemoryId) legacyIds.add(item.legacyMemoryId);
      if (item.sourceKey.startsWith('legacy:'))
        legacyIds.add(item.sourceKey.slice('legacy:'.length));
    }

    legacy = await tx.memory.findMany({
      where: {
        userId,
        OR: [
          { id: { in: [...legacyIds] } },
          { sourceMessageId: { in: [...evidence] } },
          { sourceMessageIds: { hasSome: [...evidence] } },
          ...[...sourceIds].map((id) => ({
            sourceKey: { startsWith: `rollback:${id}:` },
          })),
        ],
      },
      select: {
        id: true,
        sourceMessageId: true,
        sourceMessageIds: true,
        sourceKey: true,
      },
    });

    for (const item of legacy) {
      legacyIds.add(item.id);
      const rollbackId = rollbackSourceId(item.sourceKey);
      if (rollbackId) sourceIds.add(rollbackId);
      item.sourceMessageIds.forEach((id) => evidence.add(id));
      if (item.sourceMessageId) evidence.add(item.sourceMessageId);
    }

    if (previousSize === evidence.size + legacyIds.size + sourceIds.size) break;
  }

  const ids = affected.map(({ id }) => id);
  const bankIds = [...new Set(affected.map(({ bankId }) => bankId))].sort();
  if (bankIds.length)
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM hindsight_bank WHERE id IN (${Prisma.join(bankIds)}) ORDER BY id FOR UPDATE`,
    );
  await tx.hindsightSuppression.createMany({
    data: [...evidence].map((messageId) => ({
      userId,
      messageId,
    })),
    skipDuplicates: true,
  });
  await tx.hindsightSource.updateMany({
    where: { id: { in: ids } },
    data: { state: 'deleted' },
  });
  await tx.memoryDeletionMarker.createMany({
    data: [...evidence].map((sourceMessageId) => ({
      userId,
      sourceMessageId,
    })),
    skipDuplicates: true,
  });
  // Erase the old corpus too; a reader rollback or account export must not
  // resurrect a forgotten import. Revision links are debug metadata only.
  const oldIds = legacy.map(({ id }) => id);
  await tx.memory.updateMany({
    where: { userId, supersedesId: { in: oldIds } },
    data: { supersedesId: null },
  });
  await tx.memory.updateMany({
    where: { userId, supersededById: { in: oldIds } },
    data: { supersededById: null },
  });
  await tx.memory.deleteMany({ where: { userId, id: { in: oldIds } } });
  await tx.hindsightDelivery.updateMany({
    where: { sourceId: { in: ids }, state: { not: 'erased' } },
    data: { state: 'erase_pending', content: null },
  });
  await tx.hindsightBank.updateMany({
    where: { id: { in: affected.map(({ bankId }) => bankId) } },
    data: { nextAttemptAt: new Date() },
  });
}
