import { recordBillingEvent } from './billing.telemetry';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  BILLING_REPOSITORY,
  type IBillingRepository,
} from '../../database/interfaces';
import {
  BILLING_FILE_BYTES,
  BILLING_STORAGE_BYTES,
} from '../../shared/billing-policy';
import { ApiException, ErrorCodes } from '../../shared/errors';

@Injectable()
export class StorageQuotaService {
  private readonly logger = new Logger(StorageQuotaService.name);
  constructor(
    @Inject(BILLING_REPOSITORY) private readonly repository: IBillingRepository,
  ) {}

  async reserve(
    userId: string,
    storageKey: string,
    bytes: number,
  ): Promise<void> {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > BILLING_FILE_BYTES)
      throw new ApiException({
        code: ErrorCodes.BAD_REQUEST,
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        message: 'Ukuran file maksimal 100 MB.',
      });
    if (
      await this.repository.reserveStorage(
        userId,
        storageKey,
        bytes,
        BILLING_STORAGE_BYTES,
      )
    )
      return;
    recordBillingEvent('storage_full');
    this.logger.warn(`storage.quota_exceeded userId=${userId}`);
    const error = new ApiException({
      code: ErrorCodes.STORAGE_FULL,
      status: HttpStatus.CONFLICT,
      message: 'Penyimpanan 10 GB penuh. Hapus file untuk mengunggah lagi.',
      details: { limitBytes: BILLING_STORAGE_BYTES },
    });

    // Channel adapters surface Error.message rather than the HTTP error envelope.
    error.message =
      'Penyimpanan 10 GB penuh. Hapus file untuk mengunggah lagi.';
    throw error;
  }

  async release(storageKey: string): Promise<void> {
    try {
      await this.repository.releaseStorage(storageKey);
    } catch (error) {
      this.logger.error(
        'Storage reservation release failed; billing recovery will retry',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
