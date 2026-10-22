import { describe, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ICalendarRepository,
  IUserPrivacyRepository,
  UserExportData,
} from '../../../database/interfaces';
import type { WhatsAppConnectionsGateway } from '../../../infra/whatsapp/whatsapp-connections.gateway';
import type { GoogleCalendarService } from '../../../infra/calendar';
import { StorageService } from '../../../infra/storage';
import { extractionKey } from '../../../shared/documents';
import type { MemoryArchiveService } from '../../memories/memory-archive.service';
import { UserPrivacyService } from './user-privacy.service';

function setup(storage: StorageService) {
  const privacy = {
    exportData: jest
      .fn<IUserPrivacyRepository['exportData']>()
      .mockResolvedValue({
        user: { id: 'user-1' },
      } as unknown as UserExportData),
    storageKeys: jest
      .fn<IUserPrivacyRepository['storageKeys']>()
      .mockResolvedValue(['user-1/file-1']),
    deleteAccount: jest
      .fn<IUserPrivacyRepository['deleteAccount']>()
      .mockResolvedValue(true),
  };

  const calendars = {
    privacyExport: jest
      .fn<ICalendarRepository['privacyExport']>()
      .mockResolvedValue({ connection: null, events: [], conflicts: [] }),
    integrationCredentials: jest
      .fn<ICalendarRepository['integrationCredentials']>()
      .mockResolvedValue(null),
    disconnect: jest
      .fn<ICalendarRepository['disconnect']>()
      .mockResolvedValue(undefined),
  };

  const whatsapp = {
    disconnect: jest
      .fn<WhatsAppConnectionsGateway['disconnect']>()
      .mockResolvedValue({ revoked: true, cleanupPending: false }),
  };

  const memoryArchive = {
    export: jest
      .fn<MemoryArchiveService['export']>()
      .mockResolvedValue({ version: 1, sources: [] }),
  };

  return {
    privacy,
    calendars,
    service: new UserPrivacyService(
      privacy as unknown as IUserPrivacyRepository,
      calendars as unknown as ICalendarRepository,
      whatsapp as unknown as WhatsAppConnectionsGateway,
      {} as GoogleCalendarService,
      storage,
      memoryArchive as unknown as MemoryArchiveService,
    ),
  };
}

describe('UserPrivacyService document artifacts', () => {
  test('includes Google Calendar data without exporting credentials', async () => {
    const { service, calendars } = setup({} as StorageService);
    const googleCalendar = {
      connection: {
        status: 'disconnected',
        googleEmail: 'user@example.com',
        calendarId: 'primary',
        scope: 'calendar.events',
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      events: [],
      conflicts: [],
    };

    calendars.privacyExport.mockResolvedValue(googleCalendar);

    const result = await service.export('user-1');

    expect(result.googleCalendar).toEqual(googleCalendar);
    expect(JSON.stringify(result.googleCalendar)).not.toContain('accessToken');
    expect(JSON.stringify(result.googleCalendar)).not.toContain('refreshToken');
  });

  test('removes original and checkpoint files, including a late worker write', async () => {
    const root = await mkdtemp(join(tmpdir(), 'privacy-document-artifacts-'));
    const storage = new StorageService(
      new ConfigService({ BACKEND_STORAGE_LOCAL_ROOT: root }),
    );

    const { service, privacy } = setup(storage);
    const key = 'user-1/file-1';

    try {
      await storage.put(key, Buffer.from('Original bytes'), 'text/plain');
      await storage.put(
        extractionKey(key),
        Buffer.from('Private extraction'),
        'application/json',
      );
      privacy.deleteAccount.mockImplementation(async () => {
        // The original was removed before the local account cascade. A worker
        // that already loaded it can still finish writing its checkpoint here.
        await expect(storage.get(key)).rejects.toMatchObject({
          code: 'ENOENT',
        });
        await storage.put(
          extractionKey(key),
          Buffer.from('Late extraction'),
          'application/json',
        );

        return true;
      });

      await expect(service.deleteAccount('user-1')).resolves.toEqual({
        deleted: true,
      });

      await expect(storage.get(key)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(storage.get(extractionKey(key))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('retains the account when initial checkpoint cleanup fails', async () => {
    const remove = jest
      .fn<StorageService['delete']>()
      .mockRejectedValue(new Error('Storage unavailable'));

    const { service, privacy } = setup({
      delete: remove,
    } as unknown as StorageService);

    await expect(service.deleteAccount('user-1')).rejects.toMatchObject({
      response: {
        error: {
          message: expect.stringContaining(
            'Account data was retained for retry',
          ),
        },
      },
    });

    expect(privacy.deleteAccount).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(extractionKey('user-1/file-1'));
    expect(remove).not.toHaveBeenCalledWith('user-1/file-1');
  });

  test('reports final cleanup failure accurately after the account was deleted', async () => {
    const remove = jest
      .fn<StorageService['delete']>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error('Storage unavailable'));

    const { service, privacy } = setup({
      delete: remove,
    } as unknown as StorageService);

    await expect(service.deleteAccount('user-1')).rejects.toMatchObject({
      response: {
        error: {
          message: expect.stringContaining(
            'Account deleted, but final document artifact cleanup did not complete',
          ),
        },
      },
    });

    expect(privacy.deleteAccount).toHaveBeenCalledWith('user-1');
  });
});
