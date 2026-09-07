import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  CALENDAR_REPOSITORY,
  USER_PRIVACY_REPOSITORY,
  WHATSAPP_REPOSITORY,
  type ICalendarRepository,
  type IUserPrivacyRepository,
  type IWhatsAppRepository,
} from '../../../database/interfaces';
import { GoogleCalendarService } from '../../../infra/calendar';
import { StorageService } from '../../../infra/storage';
import { ApiException, ErrorCodes } from '../../../shared/errors';

@Injectable()
export class UserPrivacyService {
  constructor(
    @Inject(USER_PRIVACY_REPOSITORY)
    private readonly privacy: IUserPrivacyRepository,
    @Inject(CALENDAR_REPOSITORY)
    private readonly calendars: ICalendarRepository,
    @Inject(WHATSAPP_REPOSITORY)
    private readonly whatsapp: IWhatsAppRepository,
    private readonly google: GoogleCalendarService,
    private readonly storage: StorageService,
  ) {}

  async export(userId: string) {
    const data = await this.privacy.exportData(userId);
    if (!data) throw this.notFound();

    return data;
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
      await this.whatsapp.revokeIdentity(userId);
    } catch (error) {
      throw this.cleanupError('WhatsApp access could not be revoked', error);
    }

    const keys = await this.privacy.storageKeys(userId);

    try {
      for (const key of keys) await this.storage.delete(key);
    } catch (error) {
      throw this.cleanupError('Stored user assets could not be removed', error);
    }

    const deleted = await this.privacy.deleteAccount(userId);
    if (!deleted) throw this.cleanupError('Account deletion did not complete');

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
    const detail = cause instanceof Error ? `: ${cause.message}` : '';

    return new ApiException({
      code: ErrorCodes.INTERNAL_SERVER_ERROR,
      message: `${message}${detail}. Account data was retained for retry.`,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  }
}
