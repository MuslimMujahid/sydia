import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma';
import { User, UserProfileUpdate } from '../entities';
import type { IUserRepository } from '../interfaces';

const userSelect = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  image: true,
  timezone: true,
  locale: true,
  onboardingCompleted: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
  }

  async updateProfile(
    id: string,
    input: UserProfileUpdate,
  ): Promise<User | null> {
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingUser) {
      return null;
    }

    return this.prisma.user.update({
      where: { id },
      data: input,
      select: userSelect,
    });
  }
}
