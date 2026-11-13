import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type { ITelegramRepository, TelegramLinkCommit } from '../interfaces';

const identitySelect = {
  id: true,
  userId: true,
  provider: true,
  externalId: true,
  verifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const tokenSelect = {
  id: true,
  userId: true,
  tokenHash: true,
  expiresAt: true,
  consumedAt: true,
  consumedByExternalId: true,
  createdAt: true,
} as const;

const profileSelect = {
  id: true,
  externalIdentityId: true,
  username: true,
  firstName: true,
  lastName: true,
  lastInboundAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const inboundSelect = {
  id: true,
  providerMessageId: true,
  senderExternalId: true,
  chatExternalId: true,
  externalIdentityId: true,
  receivedAt: true,
  processedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class PrismaTelegramRepository implements ITelegramRepository {
  constructor(private readonly prisma: PrismaService) {}

  findIdentity(userId: string) {
    return this.prisma.externalIdentity.findFirst({
      where: { userId, provider: 'telegram' },
      select: identitySelect,
    });
  }

  findIdentityByExternalId(externalId: string) {
    return this.prisma.externalIdentity.findFirst({
      where: { provider: 'telegram', externalId, releasedAt: null },
      select: identitySelect,
    });
  }

  async revokeIdentity(userId: string): Promise<boolean> {
    const result = await this.prisma.externalIdentity.deleteMany({
      where: { userId, provider: 'telegram' },
    });

    return result.count === 1;
  }

  createLinkToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.prisma.telegramLinkToken.create({
      data: input,
      select: tokenSelect,
    });
  }

  /**
   * Consumes the token and replaces previous bindings in one transaction, so a
   * failed transfer restores both accounts' identities and leaves the token usable.
   */
  async commitLink(input: {
    tokenHash: string;
    externalId: string;
    now: Date;
  }): Promise<TelegramLinkCommit> {
    return this.prisma.$transaction(async (transaction) => {
      const token = await transaction.telegramLinkToken.findFirst({
        where: {
          tokenHash: input.tokenHash,
          consumedAt: null,
          expiresAt: { gt: input.now },
        },
        select: tokenSelect,
      });

      if (!token) return { status: 'token_unavailable' };

      const existing = await transaction.externalIdentity.findFirst({
        where: {
          provider: 'telegram',
          externalId: input.externalId,
          releasedAt: null,
        },
        select: identitySelect,
      });

      const consumed = await transaction.telegramLinkToken.updateMany({
        where: {
          id: token.id,
          consumedAt: null,
          expiresAt: { gt: input.now },
        },
        data: { consumedAt: input.now, consumedByExternalId: input.externalId },
      });

      if (consumed.count !== 1) return { status: 'token_unavailable' };

      const sameOwner = existing?.userId === token.userId;

      if (existing && !sameOwner) {
        // Create a fresh identity so the previous owner's channel conversation
        // is never reused by the new account. Deletion also frees the unique claim.
        await transaction.externalIdentity.deleteMany({
          where: { id: existing.id },
        });
      }

      const identity =
        existing && sameOwner
          ? existing
          : await transaction.externalIdentity.create({
              data: {
                userId: token.userId,
                provider: 'telegram',
                externalId: input.externalId,
                verifiedAt: input.now,
              },
              select: identitySelect,
            });

      await transaction.externalIdentity.deleteMany({
        where: {
          userId: token.userId,
          provider: 'telegram',
          id: { not: identity.id },
        },
      });

      return { status: 'linked', identity };
    });
  }

  getProfile(externalIdentityId: string) {
    return this.prisma.telegramProfile.findUnique({
      where: { externalIdentityId },
      select: profileSelect,
    });
  }

  upsertProfile(input: {
    externalIdentityId: string;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    lastInboundAt?: Date | null;
  }) {
    const { externalIdentityId, ...profile } = input;

    return this.prisma.telegramProfile.upsert({
      where: { externalIdentityId },
      create: input,
      update: profile,
      select: profileSelect,
    });
  }

  async recordInbound(
    input: Parameters<ITelegramRepository['recordInbound']>[0],
  ) {
    try {
      return await this.prisma.telegramInboundMessage.create({
        data: input,
        select: inboundSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return null;
      throw error;
    }
  }

  async associateInbound(
    id: string,
    externalIdentityId: string,
  ): Promise<void> {
    await this.prisma.telegramInboundMessage.updateMany({
      where: { id, externalIdentityId: null },
      data: { externalIdentityId },
    });
  }

  async markInboundProcessed(id: string, processedAt: Date): Promise<void> {
    await this.prisma.telegramInboundMessage.update({
      where: { id },
      data: { processedAt },
    });
  }
}
