import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type { IUserPrivacyRepository, UserExportData } from '../interfaces';
import { USER_EXPORT_SELECT } from '../interfaces';

@Injectable()
export class PrismaUserPrivacyRepository implements IUserPrivacyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async exportData(userId: string): Promise<UserExportData | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_EXPORT_SELECT,
    });

    if (!user) return null;

    return { exportedAt: new Date().toISOString(), user };
  }

  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    const result = await this.prisma.conversation.deleteMany({
      where: { id: conversationId, userId },
    });

    return result.count === 1;
  }

  async storageKeys(userId: string): Promise<string[]> {
    const assets = await this.prisma.fileAsset.findMany({
      where: { userId },
      select: { storageKey: true },
    });

    return assets.map((asset) => asset.storageKey);
  }

  async deleteAccount(userId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Match the ledger's owner-first locking order. The erasure intent and
      // local account deletion commit together; no cascade can lose the job.
      const users = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`,
      );

      if (!users.length) return false;
      await tx.hindsightCheckpoint.deleteMany({ where: { userId } });
      await tx.hindsightBank.updateMany({
        where: { userId },
        data: {
          state: 'erasing',
          nextAttemptAt: new Date(),
          lastErrorCode: null,
        },
      });
      await tx.hindsightSource.updateMany({
        where: { bank: { userId } },
        data: { state: 'deleted' },
      });
      await tx.hindsightDelivery.updateMany({
        where: { source: { bank: { userId } }, state: { not: 'erased' } },
        data: { state: 'erase_pending', content: null },
      });
      await tx.hindsightReference.deleteMany({
        where: { delivery: { source: { bank: { userId } } } },
      });
      const result = await tx.user.deleteMany({ where: { id: userId } });

      return result.count === 1;
    });
  }
}
