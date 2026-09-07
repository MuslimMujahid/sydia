import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type { ExternalIdentity } from '../entities';
import type { ITelegramRepository } from '../interfaces';

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
    return this.prisma.externalIdentity.findUnique({
      where: { provider_externalId: { provider: 'telegram', externalId } },
      select: identitySelect,
    });
  }

  createIdentity(input: {
    userId: string;
    externalId: string;
    verifiedAt: Date;
  }): Promise<ExternalIdentity> {
    return this.prisma.externalIdentity.create({
      data: { ...input, provider: 'telegram' },
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

  findLinkTokenByHash(tokenHash: string, now: Date) {
    return this.prisma.telegramLinkToken.findFirst({
      where: { tokenHash, consumedAt: null, expiresAt: { gt: now } },
      select: tokenSelect,
    });
  }

  async consumeLinkToken(id: string, externalId: string, now: Date) {
    const result = await this.prisma.telegramLinkToken.updateMany({
      where: { id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now, consumedByExternalId: externalId },
    });

    return result.count === 1;
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
