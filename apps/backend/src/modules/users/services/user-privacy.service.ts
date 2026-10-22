import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  CALENDAR_REPOSITORY,
  USER_PRIVACY_REPOSITORY,
  type ICalendarRepository,
  type IUserPrivacyRepository,
} from '../../../database/interfaces';
import { WhatsAppConnectionsGateway } from '../../../infra/whatsapp/whatsapp-connections.gateway';
import { GoogleCalendarService } from '../../../infra/calendar';
import { StorageService } from '../../../infra/storage';
import { ApiException, ErrorCodes } from '../../../shared/errors';
import { extractionKey } from '../../../shared/documents';
import { MemoryArchiveService } from '../../memories/memory-archive.service';

@Injectable()
export class UserPrivacyService {
  private readonly logger = new Logger(UserPrivacyService.name);
  constructor(
    @Inject(USER_PRIVACY_REPOSITORY)
    private readonly privacy: IUserPrivacyRepository,
    @Inject(CALENDAR_REPOSITORY)
    private readonly calendars: ICalendarRepository,
    private readonly whatsapp: WhatsAppConnectionsGateway,
    private readonly google: GoogleCalendarService,
    private readonly storage: StorageService,
    private readonly memoryArchive: MemoryArchiveService,
  ) {}

  async export(userId: string) {
    const data = await this.privacy.exportData(userId);
    if (!data) throw this.notFound();
    const [googleCalendar, hindsightMemory] = await Promise.all([
      this.calendars.privacyExport(userId),
      this.memoryArchive.export(userId),
    ]);

    return {
      ...data,
      googleCalendar,
      hindsightMemory,
    };
  }

  async deleteAccount(userId: string): Promise<{ deleted: true }> {
    const data = await this.privacy.exportData(userId);
    if (!data) throw this.notFound();

    const credentials = await this.calendars.integrationCredentials(userId);
    const token = credentials?.refreshToken ?? credentials?.accessToken;

    if (token) {
      try {
        await this.google.revoke(token);
      } catch (error) {
        throw this.cleanupError(
          'Google Calendar access could not be revoked',
          error,
        );
      }
    }

    await this.calendars.disconnect(userId);

    try {
      const result = await this.whatsapp.disconnect(userId);
      if (result.cleanupPending)
        throw new Error('WhatsApp device cleanup is still pending.');
    } catch (error) {
      throw this.cleanupError('WhatsApp access could not be revoked', error);
    }

    const keys = await this.privacy.storageKeys(userId);

    try {
      for (const key of keys) {
        await this.storage.delete(extractionKey(key));
        await this.storage.delete(key);
      }
    } catch (error) {
      throw this.cleanupError('Stored user assets could not be removed', error);
    }

    const deleted = await this.privacy.deleteAccount(userId);
    if (!deleted) throw this.cleanupError('Account deletion did not complete');

    // Workers may have written a checkpoint between the first cleanup and
    // account deletion. Later writes are cleaned up by their processing finally.
    try {
      for (const key of keys) await this.storage.delete(extractionKey(key));
    } catch (error) {
      this.logger.error(
        'Final document artifact cleanup failed after account deletion.',
        error,
      );
      throw new ApiException({
        code: ErrorCodes.INTERNAL_SERVER_ERROR,
        message:
          'Account deleted, but final document artifact cleanup did not complete.',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    }

    return { deleted: true };
  }

  private notFound(): ApiException {
    return new ApiException({
      code: ErrorCodes.NOT_FOUND,
      message: 'Authenticated user no longer exists',
      status: HttpStatus.NOT_FOUND,
    });
  }

  private cleanupError(message: string, cause?: unknown): ApiException {
    this.logger.error(message, cause);
    const detail = cause instanceof Error ? `: ${cause.message}` : '';

    return new ApiException({
      code: ErrorCodes.INTERNAL_SERVER_ERROR,
      message: `${message}${detail}. Account data was retained for retry.`,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  }
}
