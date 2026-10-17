import { Injectable } from '@nestjs/common';
import type { User } from '../entities';
import type { IChatPreviewRepository } from '../interfaces/chat-preview.repository.interface';
import { PrismaService } from '../../infra/prisma';

/** Development fixtures own these credential-free identities, never auth accounts. */
@Injectable()
export class PrismaChatPreviewRepository implements IChatPreviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createSandboxes(ids: readonly string[], profile: User): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.createMany({
        skipDuplicates: true,
        data: ids.map((id) => ({
          id,
          email: `${id}@chat-preview.invalid`,
          name: profile.name,
          timezone: profile.timezone,
          locale: profile.locale,
          persona: profile.persona,
          preferredAddress: profile.preferredAddress,
          role: 'user',
          banned: true,
          banReason: 'Development chat sandbox; sign-in is disabled.',
          onboardingCompleted: true,
          automaticMemoryEnabled: false,
        })),
      });
      await transaction.userPreference.createMany({
        skipDuplicates: true,
        data: ids.map((userId) => ({
          userId,
          briefingEnabled: false,
          weeklyBriefingEnabled: false,
          webNotificationsEnabled: false,
          telegramNotificationsEnabled: false,
          whatsappNotificationsEnabled: false,
        })),
      });
    });
  }
}
