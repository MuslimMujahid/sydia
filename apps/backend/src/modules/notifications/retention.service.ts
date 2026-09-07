import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_REPOSITORY,
  USER_PRIVACY_REPOSITORY,
  USER_REPOSITORY,
  type INotificationRepository,
  type IUserPrivacyRepository,
  type IUserRepository,
} from '../../database/interfaces';
import { StorageService } from '../../infra/storage';

@Injectable()
export class RetentionService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly preferences: INotificationRepository,
    @Inject(USER_PRIVACY_REPOSITORY)
    private readonly privacy: IUserPrivacyRepository,
    private readonly storage: StorageService,
  ) {}

  async run(userId: string, now = new Date()) {
    const user = await this.users.findById(userId);
    if (!user)
      return { status: 'skipped_user_missing' as const, deletedAssets: 0 };
    const preferences = await this.preferences.getPreferences(userId);
    const retentionDays = preferences?.retentionDays;

    if (!retentionDays || retentionDays < 1) {
      return { status: 'skipped_unconfigured' as const, deletedAssets: 0 };
    }

    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    const keys = await this.privacy.purgeExpired(userId, cutoff);
    for (const key of keys) await this.storage.delete(key);

    return {
      status: 'purged' as const,
      cutoff,
      deletedAssets: keys.length,
    };
  }
}
