import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type { INotePresenceRepository, NoteWriteResult } from '../interfaces';

/** Allows background-tab timer throttling while bounding abandoned protection. */
export const NOTE_PRESENCE_LEASE_MS = 5 * 60_000;

@Injectable()
export class PrismaNotePresenceRepository implements INotePresenceRepository {
  private readonly logger = new Logger(PrismaNotePresenceRepository.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Owner-wide arbitration also supports future folder/subtree mutations. */
  private async locked<T>(
    userId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.inTransaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`note-presence:${userId}`}, 0))::text`,
        );

        return work(tx);
      });
    } catch (error) {
      this.logger.error(
        'Note presence arbitration failed; automatic writes must remain pending. Check database connectivity and transaction timeouts.',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  acquire(
    userId: string,
    ref: string,
    sessionId: string,
  ): Promise<{ expiresAt: Date }> {
    return this.locked(userId, async (tx) => {
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>(
        Prisma.sql`SELECT clock_timestamp() AS now`,
      );

      if (!clock) throw new Error('Database clock is unavailable.');
      const expiresAt = new Date(clock.now.getTime() + NOTE_PRESENCE_LEASE_MS);
      await tx.noteEditorPresence.deleteMany({
        where: { userId, expiresAt: { lte: clock.now } },
      });
      await tx.noteEditorPresence.upsert({
        where: { userId_ref_sessionId: { userId, ref, sessionId } },
        create: { userId, ref, sessionId, expiresAt },
        update: { expiresAt },
      });

      return { expiresAt };
    });
  }

  async release(userId: string, ref: string, sessionId: string): Promise<void> {
    await this.locked(userId, async (tx) => {
      await tx.noteEditorPresence.deleteMany({
        where: { userId, ref, sessionId },
      });
    });
  }

  write<T>(
    userId: string,
    refs: readonly string[] | (() => Promise<readonly string[]>),
    mutation: () => Promise<T>,
  ): Promise<NoteWriteResult<T>> {
    return this.locked(userId, async (tx) => {
      const targets = typeof refs === 'function' ? await refs() : refs;
      if (!targets.length)
        throw new Error(
          'Protected note writes require explicit target references.',
        );
      const open = await tx.$queryRaw<Array<{ ref: string }>>(Prisma.sql`
        SELECT ref FROM note_editor_presence WHERE "userId" = ${userId}
        AND ref IN (${Prisma.join([...targets])}) AND "expiresAt" > clock_timestamp() LIMIT 1
      `);

      if (open.length) return { status: 'deferred', reason: 'note_open' };

      return { status: 'completed', value: await mutation() };
    });
  }
}
