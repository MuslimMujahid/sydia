import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_REPOSITORY,
  type INotificationRepository,
} from '../../../database/interfaces';
import type {
  AssistantPersona,
  UserPreference,
  UserPreferenceUpdate,
  UserProfileUpdate,
} from '../../../database/entities';

export type PublicUserPreferences = {
  automaticMemoryEnabled: boolean;
  persona: AssistantPersona;
  preferredAddress: string | null;
  briefingEnabled: boolean;
  briefingTime: string;
  webNotificationsEnabled: boolean;
  whatsappNotificationsEnabled: boolean;
};

type PreferenceInput = UserPreferenceUpdate & {
  automaticMemoryEnabled?: boolean;
  persona?: UserProfileUpdate['persona'];
  preferredAddress?: UserProfileUpdate['preferredAddress'];
};

function normalizePreferredAddress(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null) return value;
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

const defaults = {
  briefingEnabled: true,
  briefingTime: '08:00',
  webNotificationsEnabled: true,
  whatsappNotificationsEnabled: true,
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
    persona: AssistantPersona;
    preferredAddress: string | null;
  }): Promise<PublicUserPreferences> {
    return this.present(user, await this.preferences.getPreferences(user.id));
  }

  async update(
    user: {
      id: string;
      automaticMemoryEnabled: boolean;
      persona: AssistantPersona;
      preferredAddress: string | null;
    },
    input: PreferenceInput,
    updateUser: (input: UserProfileUpdate) => Promise<{
      automaticMemoryEnabled: boolean;
      persona: AssistantPersona;
      preferredAddress: string | null;
    } | null>,
  ): Promise<PublicUserPreferences | null> {
    const {
      automaticMemoryEnabled,
      persona,
      preferredAddress,
      ...preferenceInput
    } = input;

    const normalizedPreferredAddress =
      normalizePreferredAddress(preferredAddress);

    let currentUser = user;

    if (
      automaticMemoryEnabled !== undefined ||
      persona !== undefined ||
      normalizedPreferredAddress !== undefined
    ) {
      const updatedUser = await updateUser({
        ...(automaticMemoryEnabled !== undefined
          ? { automaticMemoryEnabled }
          : {}),
        ...(persona !== undefined ? { persona } : {}),
        ...(normalizedPreferredAddress !== undefined
          ? { preferredAddress: normalizedPreferredAddress }
          : {}),
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
    user: {
      automaticMemoryEnabled: boolean;
      persona: AssistantPersona;
      preferredAddress: string | null;
    },
    stored: UserPreference | null,
  ): PublicUserPreferences {
    return {
      automaticMemoryEnabled: user.automaticMemoryEnabled,
      persona: user.persona,
      preferredAddress: user.preferredAddress,
      briefingEnabled: stored?.briefingEnabled ?? defaults.briefingEnabled,
      briefingTime: stored?.briefingTime ?? defaults.briefingTime,
      webNotificationsEnabled:
        stored?.webNotificationsEnabled ?? defaults.webNotificationsEnabled,
      whatsappNotificationsEnabled:
        stored?.whatsappNotificationsEnabled ??
        defaults.whatsappNotificationsEnabled,
    };
  }
}
