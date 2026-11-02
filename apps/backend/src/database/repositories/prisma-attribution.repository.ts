import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma';
import type { RecordAttributionInput, UserAttribution } from '../entities';
import type { IAttributionRepository } from '../interfaces';

const attributionSelect = {
  userId: true,
  visitorId: true,
  utmSource: true,
  utmMedium: true,
  utmCampaign: true,
  utmContent: true,
  utmTerm: true,
  referrer: true,
  landingPath: true,
  createdAt: true,
} as const;

@Injectable()
export class PrismaAttributionRepository implements IAttributionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordFirstTouch(input: RecordAttributionInput): Promise<{
    attribution: UserAttribution;
    created: boolean;
  }> {
    const { count } = await this.prisma.userAttribution.createMany({
      data: [input],
      skipDuplicates: true,
    });

    const attribution = await this.findByUserId(input.userId);

    // createMany skipped a duplicate or the user vanished between statements.
    if (!attribution) {
      throw new Error('user_attribution.write_missing');
    }

    return { attribution, created: count > 0 };
  }

  private findByUserId(userId: string): Promise<UserAttribution | null> {
    return this.prisma.userAttribution.findUnique({
      where: { userId },
      select: attributionSelect,
    });
  }
}
