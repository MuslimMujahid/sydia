import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma';
import type {
  IModelUsageRepository,
  ModelUsageEntry,
} from '../interfaces/model-usage.repository.interface';

@Injectable()
export class PrismaModelUsageRepository implements IModelUsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: ModelUsageEntry): Promise<void> {
    // Always the root client: spend is final even when the caller's own
    // transaction later rolls back.
    await this.prisma.modelUsage.create({
      data: {
        ...entry,
        featureCosts: entry.featureCosts ?? Prisma.DbNull,
      },
    });
  }

  async recordCumulative({
    source,
    totalUsd,
    takenAt,
    entry,
  }: {
    source: string;
    totalUsd: number;
    takenAt: Date;
    entry: Omit<
      ModelUsageEntry,
      'costUsd' | 'costMissing' | 'featureCosts' | 'cachedInputTokens'
    >;
  }): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO provider_usage_snapshot (source, "totalUsd", "takenAt")
        VALUES (${source}, ${totalUsd}, ${takenAt})
        ON CONFLICT (source) DO NOTHING
      `;
      const rows = await tx.$queryRaw<
        Array<{ totalUsd: Prisma.Decimal; takenAt: Date }>
      >`SELECT "totalUsd", "takenAt" FROM provider_usage_snapshot WHERE source = ${source} FOR UPDATE`;

      const previous = rows[0];
      if (!previous || previous.takenAt >= takenAt) return 0;

      const spent = new Prisma.Decimal(totalUsd).minus(previous.totalUsd);

      await tx.providerUsageSnapshot.update({
        where: { source },
        data: { totalUsd, takenAt },
      });

      // A lower total means the key was replaced; restart from its reading.
      if (spent.lte(0)) return 0;

      await tx.modelUsage.create({
        data: {
          ...entry,
          createdAt: takenAt,
          costUsd: spent,
          costMissing: false,
        },
      });

      return spent.toNumber();
    });
  }
}
