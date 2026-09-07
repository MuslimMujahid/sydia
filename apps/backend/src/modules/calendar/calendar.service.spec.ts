import { describe, expect, jest, test } from '@jest/globals';
import type { ICalendarRepository } from '../../database/interfaces';
import { GoogleCalendarService } from '../../infra/calendar';
import { CalendarService } from './calendar.service';

interface StoredCredentials {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  calendarId: string | null;
}
type Credentials = { accessToken: string; calendarId: string } | null;
type CredentialsReader = (userId: string) => Promise<Credentials>;
interface CalendarServicePrivate {
  credentials: CredentialsReader;
}

const userId = 'user-1';
const now = new Date('2026-01-01T12:00:00.000Z');

function createService(stored: StoredCredentials) {
  const integrationCredentials = jest
    .fn<() => Promise<StoredCredentials | null>>()
    .mockResolvedValue(stored);

  const updateAccessToken = jest
    .fn<
      (userId: string, accessToken: string, expiresAt: Date) => Promise<void>
    >()
    .mockResolvedValue(undefined);

  const refresh = jest
    .fn<GoogleCalendarService['refresh']>()
    .mockResolvedValue({
      accessToken: 'refreshed-token',
      expiresAt: new Date('2026-01-01T13:00:00.000Z'),
    });

  const calendars = {
    integrationCredentials,
    updateAccessToken,
  } as unknown as ICalendarRepository;

  const google = { refresh } as unknown as GoogleCalendarService;
  const service = new CalendarService(calendars, google);
  const privateService = service as unknown as CalendarServicePrivate;
  const credentials = privateService.credentials.bind(service);

  return { credentials, integrationCredentials, updateAccessToken, refresh };
}

describe('CalendarService credentials', () => {
  afterEach(() => jest.restoreAllMocks());
  test('refreshes an expired access token when a refresh token exists', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());

    const service = createService({
      accessToken: 'expired-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date('2026-01-01T11:00:00.000Z'),
      calendarId: 'work',
    });

    const refreshedResult = await service.credentials(userId);
    expect(refreshedResult).toEqual({
      accessToken: 'refreshed-token',
      calendarId: 'work',
    });
    expect(service.refresh).toHaveBeenCalledTimes(1);
    expect(service.updateAccessToken).toHaveBeenCalledTimes(1);
  });

  test('returns null for an expired access token without a refresh token', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    const service = createService({
      accessToken: 'expired-token',
      refreshToken: null,
      expiresAt: new Date('2026-01-01T11:00:00.000Z'),
      calendarId: null,
    });

    await expect(service.credentials(userId)).resolves.toBeNull();
    expect(service.refresh).not.toHaveBeenCalled();
  });

  test('returns an unexpired cached access token without refreshing', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    const service = createService({
      accessToken: 'cached-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date('2026-01-01T12:01:00.000Z'),
      calendarId: null,
    });

    await expect(service.credentials(userId)).resolves.toEqual({
      accessToken: 'cached-token',
      calendarId: 'primary',
    });
    expect(service.refresh).not.toHaveBeenCalled();
  });

  test('returns null when the access token is missing', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    const service = createService({
      accessToken: null,
      refreshToken: 'refresh-token',
      expiresAt: new Date('2026-01-01T13:00:00.000Z'),
      calendarId: null,
    });

    await expect(service.credentials(userId)).resolves.toBeNull();
  });

  test('returns null when the expiry is missing', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    const service = createService({
      accessToken: 'token',
      refreshToken: 'refresh-token',
      expiresAt: null,
      calendarId: null,
    });

    await expect(service.credentials(userId)).resolves.toBeNull();
  });
});
