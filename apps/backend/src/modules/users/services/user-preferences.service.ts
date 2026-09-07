import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_REPOSITORY,
  type INotificationRepository,
} from '../../../database/interfaces';
import type {
  UserPreference,
  UserPreferenceUpdate,
  UserProfileUpdate,
} from '../../../database/entities';

export type PublicUserPreferences = {
  automaticMemoryEnabled: boolean;
  persona: string;
  assistantVerbosity: string;
  assistantStyle: string;
  briefingEnabled: boolean;
  briefingTime: string;
  webNotificationsEnabled: boolean;
  whatsappNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  proactivePaused: boolean;
  retentionDays: number;
};

type PreferenceInput = UserPreferenceUpdate & {
  automaticMemoryEnabled?: boolean;
  persona?: UserProfileUpdate['persona'];
};

const defaults = {
  assistantVerbosity: 'balanced',
  assistantStyle: 'supportive',
  briefingEnabled: false,
  briefingTime: '08:00',
  webNotificationsEnabled: true,
  whatsappNotificationsEnabled: true,
  emailNotificationsEnabled: false,
  proactivePaused: false,
  retentionDays: 90,
} as const;

@Injectable()
export class UserPreferencesService {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly preferences: INotificationRepository,
  ) {}

  async get(user: {
    id: string;
    automaticMemoryEnabled: boolean;
    persona: string;
  }): Promise<PublicUserPreferences> {
    return this.present(user, await this.preferences.getPreferences(user.id));
  }

  async update(
    user: {
      id: string;
      automaticMemoryEnabled: boolean;
      persona: string;
    },
    input: PreferenceInput,
    updateUser: (input: UserProfileUpdate) => Promise<{
      automaticMemoryEnabled: boolean;
      persona: string;
    } | null>,
  ): Promise<PublicUserPreferences | null> {
    const { automaticMemoryEnabled, persona, ...preferenceInput } = input;

    let currentUser = user;

    if (automaticMemoryEnabled !== undefined || persona !== undefined) {
      const updatedUser = await updateUser({
        ...(automaticMemoryEnabled !== undefined
          ? { automaticMemoryEnabled }
          : {}),
        ...(persona !== undefined ? { persona } : {}),
      });

      if (!updatedUser) return null;
      currentUser = { ...user, ...updatedUser };
    }

    const stored = Object.keys(preferenceInput).length
      ? await this.preferences.savePreferences(user.id, preferenceInput)
      : await this.preferences.getPreferences(user.id);

    return this.present(currentUser, stored);
  }

  present(
    user: { automaticMemoryEnabled: boolean; persona: string },
    stored: UserPreference | null,
  ): PublicUserPreferences {
    return {
      automaticMemoryEnabled: user.automaticMemoryEnabled,
      persona: user.persona,
      assistantVerbosity:
        stored?.assistantVerbosity ?? defaults.assistantVerbosity,
      assistantStyle: stored?.assistantStyle ?? defaults.assistantStyle,
      briefingEnabled: stored?.briefingEnabled ?? defaults.briefingEnabled,
      briefingTime: stored?.briefingTime ?? defaults.briefingTime,
      webNotificationsEnabled:
        stored?.webNotificationsEnabled ?? defaults.webNotificationsEnabled,
      whatsappNotificationsEnabled:
        stored?.whatsappNotificationsEnabled ??
        defaults.whatsappNotificationsEnabled,
      emailNotificationsEnabled:
        stored?.emailNotificationsEnabled ?? defaults.emailNotificationsEnabled,
      proactivePaused: stored?.proactivePaused ?? defaults.proactivePaused,
      retentionDays: stored?.retentionDays ?? defaults.retentionDays,
    };
  }
}
