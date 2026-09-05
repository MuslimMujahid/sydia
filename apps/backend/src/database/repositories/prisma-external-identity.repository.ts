import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma';
import { ExternalIdentity } from '../entities';
import type { IExternalIdentityRepository } from '../interfaces';

const externalIdentitySelect = {
  id: true,
  userId: true,
  provider: true,
  externalId: true,
  verifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaExternalIdentityRepository implements IExternalIdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByProviderExternalId(
    provider: string,
    externalId: string,
  ): Promise<ExternalIdentity | null> {
    return this.prisma.externalIdentity.findUnique({
      where: { provider_externalId: { provider, externalId } },
      select: externalIdentitySelect,
    });
  }

  async create(input: {
    userId: string;
    provider: string;
    externalId: string;
    verifiedAt?: Date | null;
  }): Promise<ExternalIdentity> {
    return this.prisma.externalIdentity.create({
      data: input,
      select: externalIdentitySelect,
    });
  }
}
