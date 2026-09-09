import { describe, expect, jest, test } from '@jest/globals';
import type {
  AssistantPersona,
  UserPreference,
  UserPreferenceUpdate,
  UserProfileUpdate,
} from '../../../database/entities';
import type { INotificationRepository } from '../../../database/interfaces';
import { UserPreferencesService } from './user-preferences.service';

const storedPreference: UserPreference = {
  userId: 'user-1',
  briefingEnabled: true,
  briefingTime: '09:30',
  webNotificationsEnabled: true,
  whatsappNotificationsEnabled: false,
  emailNotificationsEnabled: true,
  proactivePaused: false,
  retentionDays: 30,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const user = {
  id: 'user-1',
  automaticMemoryEnabled: false,
  persona: 'personal_assistant' as const,
  preferredAddress: null,
};

function createRepository(stored: UserPreference | null = storedPreference) {
  const getPreferences = jest
    .fn<(userId: string) => Promise<UserPreference | null>>()
    .mockResolvedValue(stored);

  const savePreferences = jest
    .fn<
      (userId: string, input: UserPreferenceUpdate) => Promise<UserPreference>
    >()
    .mockResolvedValue(storedPreference);

  const repository = {
    getPreferences,
    savePreferences,
  } satisfies Pick<
    INotificationRepository,
    'getPreferences' | 'savePreferences'
  >;

  return {
    repository: repository as unknown as INotificationRepository,
    getPreferences,
    savePreferences,
  };
}

function updateUserResult(
  persona: AssistantPersona,
  preferredAddress: string | null = null,
) {
  return Promise.resolve({
    automaticMemoryEnabled: true,
    persona,
    preferredAddress,
  });
}

describe('UserPreferencesService', () => {
  test('returns persona and omits removed assistant preference fields', async () => {
    const { repository } = createRepository();
    const service = new UserPreferencesService(repository);

    const result = await service.get({ ...user, persona: 'mentor' });

    expect(result).toEqual({
      automaticMemoryEnabled: false,
      persona: 'mentor',
      preferredAddress: null,
      briefingEnabled: true,
      briefingTime: '09:30',
      webNotificationsEnabled: true,
      whatsappNotificationsEnabled: false,
      emailNotificationsEnabled: true,
      proactivePaused: false,
      retentionDays: 30,
    });
    expect(result).not.toHaveProperty('assistantVerbosity');
    expect(result).not.toHaveProperty('assistantStyle');
  });

  test('updates persona canonically and persists only notification preferences', async () => {
    const { repository, savePreferences } = createRepository();
    const service = new UserPreferencesService(repository);
    const updateUser = jest
      .fn<
        (input: UserProfileUpdate) => Promise<{
          automaticMemoryEnabled: boolean;
          persona: AssistantPersona;
          preferredAddress: string | null;
        } | null>
      >()
      .mockImplementation(() => updateUserResult('creative_partner'));

    const result = await service.update(
      user,
      {
        persona: 'creative_partner',
        briefingEnabled: false,
        retentionDays: 14,
      },
      updateUser,
    );

    expect(updateUser).toHaveBeenCalledWith({ persona: 'creative_partner' });
    expect(savePreferences).toHaveBeenCalledWith('user-1', {
      briefingEnabled: false,
      retentionDays: 14,
    });
    expect(result?.persona).toBe('creative_partner');
    expect(result).not.toHaveProperty('assistantVerbosity');
    expect(result).not.toHaveProperty('assistantStyle');
  });

  test('does not persist notification preferences for a persona-only update', async () => {
    const { repository, getPreferences, savePreferences } = createRepository();
    const service = new UserPreferencesService(repository);
    const updateUser = jest
      .fn<
        (input: UserProfileUpdate) => Promise<{
          automaticMemoryEnabled: boolean;
          persona: AssistantPersona;
          preferredAddress: string | null;
        } | null>
      >()
      .mockImplementation(() => updateUserResult('friend'));

    const result = await service.update(
      user,
      { persona: 'friend' },
      updateUser,
    );

    expect(updateUser).toHaveBeenCalledWith({ persona: 'friend' });
    expect(savePreferences).not.toHaveBeenCalled();
    expect(getPreferences).toHaveBeenCalledWith('user-1');
    expect(result?.persona).toBe('friend');
  });

  test('persists and returns a normalized preferred address', async () => {
    const { repository } = createRepository();
    const service = new UserPreferencesService(repository);
    const updateUser = jest
      .fn<
        (input: UserProfileUpdate) => Promise<{
          automaticMemoryEnabled: boolean;
          persona: AssistantPersona;
          preferredAddress: string | null;
        } | null>
      >()
      .mockImplementation(() =>
        updateUserResult('personal_assistant', 'Kak Raka'),
      );

    const result = await service.update(
      user,
      { preferredAddress: ' Kak Raka ' },
      updateUser,
    );

    expect(updateUser).toHaveBeenCalledWith({ preferredAddress: 'Kak Raka' });
    expect(result?.preferredAddress).toBe('Kak Raka');
  });

  test('clears a preferred address with null', async () => {
    const { repository } = createRepository();
    const service = new UserPreferencesService(repository);

    const updateUser = jest
      .fn<
        (input: UserProfileUpdate) => Promise<{
          automaticMemoryEnabled: boolean;
          persona: AssistantPersona;
          preferredAddress: string | null;
        } | null>
      >()
      .mockImplementation(() => updateUserResult('personal_assistant'));

    const result = await service.update(
      { ...user, preferredAddress: 'Kak Raka' },
      { preferredAddress: null },
      updateUser,
    );

    expect(updateUser).toHaveBeenCalledWith({ preferredAddress: null });
    expect(result?.preferredAddress).toBeNull();
  });
});
