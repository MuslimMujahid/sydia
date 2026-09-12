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
  telegramNotificationsEnabled: true,
  whatsappNotificationsEnabled: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const user = {
  id: 'user-1',
  automaticMemoryEnabled: false,
  persona: 'professional' as const,
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

    const result = await service.get({ ...user, persona: 'professional' });

    expect(result).toEqual({
      automaticMemoryEnabled: false,
      persona: 'professional',
      preferredAddress: null,
      briefingEnabled: true,
      briefingTime: '09:30',
      webNotificationsEnabled: true,
      telegramNotificationsEnabled: true,
      whatsappNotificationsEnabled: false,
    });
    expect(result).not.toHaveProperty('assistantVerbosity');
    expect(result).not.toHaveProperty('assistantStyle');
  });

  test('enables daily briefing when preferences do not exist', async () => {
    const { repository } = createRepository(null);
    const service = new UserPreferencesService(repository);

    const result = await service.get(user);

    expect(result.briefingEnabled).toBe(true);
    expect(result.briefingTime).toBe('08:00');
    expect(result.telegramNotificationsEnabled).toBe(true);
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
      .mockImplementation(() => updateUserResult('playful'));

    const result = await service.update(
      user,
      {
        persona: 'playful',
        briefingEnabled: false,
      },
      updateUser,
    );

    expect(updateUser).toHaveBeenCalledWith({ persona: 'playful' });
    expect(savePreferences).toHaveBeenCalledWith('user-1', {
      briefingEnabled: false,
    });
    expect(result?.persona).toBe('playful');
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
      .mockImplementation(() => updateUserResult('friendly'));

    const result = await service.update(
      user,
      { persona: 'friendly' },
      updateUser,
    );

    expect(updateUser).toHaveBeenCalledWith({ persona: 'friendly' });
    expect(savePreferences).not.toHaveBeenCalled();
    expect(getPreferences).toHaveBeenCalledWith('user-1');
    expect(result?.persona).toBe('friendly');
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
      .mockImplementation(() => updateUserResult('professional', 'Kak Raka'));

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
      .mockImplementation(() => updateUserResult('professional'));

    const result = await service.update(
      { ...user, preferredAddress: 'Kak Raka' },
      { preferredAddress: null },
      updateUser,
    );

    expect(updateUser).toHaveBeenCalledWith({ preferredAddress: null });
    expect(result?.preferredAddress).toBeNull();
  });
});
