import { Injectable } from '@nestjs/common';
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

  async purgeExpired(userId: string, cutoff: Date): Promise<string[]> {
    const oldConversationAssets = await this.prisma.fileAsset.findMany({
      where: {
        userId,
        document: null,
        messages: {
          some: { message: { createdAt: { lt: cutoff } } },
          every: { message: { createdAt: { lt: cutoff } } },
        },
      },
      select: { id: true, storageKey: true },
    });

    const oldConversations = await this.prisma.conversation.findMany({
      where: { userId, updatedAt: { lt: cutoff } },
      select: { id: true },
    });

    await this.prisma.$transaction(async (transaction) => {
      if (oldConversations.length) {
        await transaction.conversation.deleteMany({
          where: { id: { in: oldConversations.map(({ id }) => id) }, userId },
        });
      }

      await transaction.message.deleteMany({
        where: { userId, createdAt: { lt: cutoff } },
      });
      await transaction.conversationSummary.deleteMany({
        where: { conversation: { userId }, createdAt: { lt: cutoff } },
      });

      if (oldConversationAssets.length) {
        await transaction.fileAsset.deleteMany({
          where: {
            id: { in: oldConversationAssets.map(({ id }) => id) },
            userId,
          },
        });
      }
    });

    return oldConversationAssets.map(({ storageKey }) => storageKey);
  }

  async deleteAccount(userId: string): Promise<boolean> {
    const result = await this.prisma.user.deleteMany({ where: { id: userId } });

    return result.count === 1;
  }
}
