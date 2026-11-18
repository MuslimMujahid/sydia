import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_REPOSITORY,
  type INotificationRepository,
} from '../../../database/interfaces';
import { USER_OCCUPATIONS } from '../../../database/entities';
import type {
  AssistantPersona,
  UserOccupation,
  UserPreference,
  UserPreferenceUpdate,
  UserProfileUpdate,
} from '../../../database/entities';

export type PublicUserPreferences = {
  automaticMemoryEnabled: boolean;
  persona: AssistantPersona;
  preferredAddress: string | null;
  occupation: UserOccupation | null;
  briefingEnabled: boolean;
  weeklyBriefingEnabled: boolean;
  weeklyBriefingDay: number;
  briefingTime: string;
  followUpIntervalMinutes: number;
  webNotificationsEnabled: boolean;
  telegramNotificationsEnabled: boolean;
  whatsappNotificationsEnabled: boolean;
};

type PreferenceInput = UserPreferenceUpdate & {
  automaticMemoryEnabled?: boolean;
  persona?: UserProfileUpdate['persona'];
  preferredAddress?: UserProfileUpdate['preferredAddress'];
  occupation?: UserOccupation | null;
};

type PreferenceUser = {
  id: string;
  automaticMemoryEnabled: boolean;
  persona: AssistantPersona;
  preferredAddress: string | null;
  occupation: string | null;
};

const OCCUPATIONS: ReadonlySet<string> = new Set(USER_OCCUPATIONS);

/** Stored values outside the current list read as unanswered. */
function knownOccupation(value: string | null): UserOccupation | null {
  return value !== null && OCCUPATIONS.has(value)
    ? (value as UserOccupation)
    : null;
}

function normalizePreferredAddress(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null) return value;
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

const defaults = {
  briefingEnabled: true,
  weeklyBriefingEnabled: true,
  weeklyBriefingDay: 1,
  briefingTime: '08:00',
  followUpIntervalMinutes: 60,
  webNotificationsEnabled: true,
  telegramNotificationsEnabled: true,
  whatsappNotificationsEnabled: true,
} as const;

@Injectable()
export class UserPreferencesService {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly preferences: INotificationRepository,
  ) {}

  async get(user: PreferenceUser): Promise<PublicUserPreferences> {
    return this.present(user, await this.preferences.getPreferences(user.id));
  }

  async update(
    user: PreferenceUser,
    input: PreferenceInput,
    updateUser: (
      input: UserProfileUpdate,
    ) => Promise<Omit<PreferenceUser, 'id'> | null>,
  ): Promise<PublicUserPreferences | null> {
    const {
      automaticMemoryEnabled,
      persona,
      preferredAddress,
      occupation,
      ...preferenceInput
    } = input;

    const normalizedPreferredAddress =
      normalizePreferredAddress(preferredAddress);

    let currentUser = user;

    if (
      automaticMemoryEnabled !== undefined ||
      persona !== undefined ||
      normalizedPreferredAddress !== undefined ||
      occupation !== undefined
    ) {
      const updatedUser = await updateUser({
        ...(automaticMemoryEnabled !== undefined
          ? { automaticMemoryEnabled }
          : {}),
        ...(persona !== undefined ? { persona } : {}),
        ...(normalizedPreferredAddress !== undefined
          ? { preferredAddress: normalizedPreferredAddress }
          : {}),
        ...(occupation !== undefined ? { occupation } : {}),
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
    user: Omit<PreferenceUser, 'id'>,
    stored: UserPreference | null,
  ): PublicUserPreferences {
    return {
      automaticMemoryEnabled: user.automaticMemoryEnabled,
      persona: user.persona,
      preferredAddress: user.preferredAddress,
      occupation: knownOccupation(user.occupation),
      briefingEnabled: stored?.briefingEnabled ?? defaults.briefingEnabled,
      weeklyBriefingEnabled:
        stored?.weeklyBriefingEnabled ?? defaults.weeklyBriefingEnabled,
      weeklyBriefingDay:
        stored?.weeklyBriefingDay ?? defaults.weeklyBriefingDay,
      briefingTime: stored?.briefingTime ?? defaults.briefingTime,
      followUpIntervalMinutes:
        stored?.followUpIntervalMinutes ?? defaults.followUpIntervalMinutes,
      webNotificationsEnabled:
        stored?.webNotificationsEnabled ?? defaults.webNotificationsEnabled,
      telegramNotificationsEnabled:
        stored?.telegramNotificationsEnabled ??
        defaults.telegramNotificationsEnabled,
      whatsappNotificationsEnabled:
        stored?.whatsappNotificationsEnabled ??
        defaults.whatsappNotificationsEnabled,
    };
  }
}
