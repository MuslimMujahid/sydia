import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma';
import type { Secret, SecretRecord, SecretRevealRecord } from '../entities';
import type { ISecretRepository } from '../interfaces';

const secretSelect = {
  id: true,
  label: true,
  createdAt: true,
  updatedAt: true,
  lastRevealedAt: true,
  revealCount: true,
} as const;

const secretRecordSelect = {
  ...secretSelect,
  encryptedValue: true,
} as const;

type SecretRow = {
  id: string;
  label: string;
  createdAt: Date;
  updatedAt: Date;
  lastRevealedAt: Date | null;
  revealCount: number;
};

type SecretRecordRow = SecretRow & { encryptedValue: string };

function present(row: SecretRow): Secret {
  return row;
}

function presentRecord(row: SecretRecordRow): SecretRecord {
  return row;
}

@Injectable()
export class PrismaSecretRepository implements ISecretRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<Secret[]> {
    const rows = await this.prisma.secret.findMany({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: secretSelect,
    });

    return rows.map(present);
  }

  async findById(userId: string, id: string): Promise<Secret | null> {
    const row = await this.prisma.secret.findFirst({
      where: { id, userId },
      select: secretSelect,
    });

    return row ? present(row) : null;
  }

  async search(userId: string, query: string): Promise<Secret[]> {
    const terms = query
      .toLocaleLowerCase('id-ID')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length > 1);

    if (terms.length === 0) return [];

    const rows = await this.prisma.secret.findMany({
      where: {
        userId,
        OR: terms.map((term) => ({
          label: { contains: term, mode: 'insensitive' },
        })),
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: secretSelect,
    });

    return rows.map(present);
  }

  async findEncrypted(
    userId: string,
    id: string,
  ): Promise<SecretRecord | null> {
    const row = await this.prisma.secret.findFirst({
      where: { id, userId },
      select: secretRecordSelect,
    });

    return row ? presentRecord(row) : null;
  }

  async create(
    userId: string,
    input: { label: string; encryptedValue: string },
  ): Promise<Secret> {
    return this.prisma.secret.create({
      data: { userId, ...input },
      select: secretSelect,
    });
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.secret.deleteMany({
      where: { id, userId },
    });

    return result.count === 1;
  }

  async createRevealToken(input: {
    userId: string;
    secretId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const secret = await this.prisma.secret.findFirst({
      where: { id: input.secretId, userId: input.userId },
      select: { id: true },
    });

    if (!secret) return false;

    await this.prisma.secretRevealToken.create({ data: input });

    return true;
  }

  async consumeRevealToken(
    tokenHash: string,
    now: Date,
  ): Promise<SecretRevealRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const token = await transaction.secretRevealToken.findFirst({
        where: {
          tokenHash,
          consumedAt: null,
          expiresAt: { gt: now },
          attemptCount: { lt: 5 },
        },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          secret: { select: secretRecordSelect },
        },
      });

      if (!token) return null;

      const consumed = await transaction.secretRevealToken.updateMany({
        where: {
          id: token.id,
          consumedAt: null,
          expiresAt: { gt: now },
          attemptCount: { lt: 5 },
        },
        data: { consumedAt: now },
      });

      if (consumed.count !== 1) return null;

      return {
        tokenId: token.id,
        userId: token.userId,
        expiresAt: token.expiresAt,
        secret: presentRecord(token.secret),
      };
    });
  }

  async recordReveal(
    tokenId: string,
    secretId: string,
    now: Date,
  ): Promise<boolean> {
    const result = await this.prisma.secret.updateMany({
      where: {
        id: secretId,
        revealTokens: { some: { id: tokenId, consumedAt: now } },
      },
      data: { lastRevealedAt: now, revealCount: { increment: 1 } },
    });

    return result.count === 1;
  }

  async recordFailedReveal(tokenHash: string): Promise<void> {
    await this.prisma.secretRevealToken.updateMany({
      where: { tokenHash, consumedAt: null },
      data: { attemptCount: { increment: 1 } },
    });
  }

  async unlockSession(
    userId: string,
    sessionId: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.secretVaultUnlock.upsert({
      where: { sessionId },
      create: { userId, sessionId, expiresAt },
      update: { userId, expiresAt },
    });
  }

  async sessionUnlocked(
    userId: string,
    sessionId: string,
    now: Date,
  ): Promise<boolean> {
    const unlock = await this.prisma.secretVaultUnlock.findFirst({
      where: { userId, sessionId, expiresAt: { gt: now } },
      select: { id: true },
    });

    return unlock !== null;
  }
}
