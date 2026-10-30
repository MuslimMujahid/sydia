import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
} from '../../database/interfaces';
import { BILLING_TRIAL_DAYS } from '../../shared/billing-policy';
import { ApiException, ErrorCodes } from '../../shared/errors';
import type { AdminGiftPlusDto } from './admin-gift-plus.dto';

@Injectable()
export class AdminGiftPlusService {
  private readonly logger = new Logger(AdminGiftPlusService.name);

  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly repository: IAdminRepository,
    private readonly config: ConfigService,
  ) {}

  async gift(actorId: string, userId: string, input: AdminGiftPlusDto) {
    const rollout = this.config.get<string>('BACKEND_BILLING_ROLLOUT_AT');

    if (!rollout || !Number.isFinite(Date.parse(rollout))) {
      this.logger.error('Gift requires a valid BACKEND_BILLING_ROLLOUT_AT');
      throw new ApiException({
        code: ErrorCodes.SERVICE_UNAVAILABLE,
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message:
          'Hadiah belum tersedia. Administrator perlu mengatur tanggal mulai langganan.',
      });
    }

    const result = await this.repository.giftPlus({
      ...input,
      actorId,
      userId,
      now: new Date(),
      rolloutAt: new Date(rollout),
      trialDays: BILLING_TRIAL_DAYS,
    });

    if (result.status !== 'applied') {
      this.logger.warn(`Gift rejected: ${result.status} userId=${userId}`);
      throw new ApiException({
        code:
          result.status === 'not-found'
            ? ErrorCodes.NOT_FOUND
            : ErrorCodes.CONFLICT,
        status:
          result.status === 'not-found'
            ? HttpStatus.NOT_FOUND
            : HttpStatus.CONFLICT,
        message:
          result.status === 'not-found'
            ? 'Pengguna tidak ditemukan.'
            : 'Permintaan hadiah sudah digunakan dengan durasi berbeda. Buka kembali formulir hadiah.',
      });
    }

    return { paidUntil: result.paidUntil };
  }
}
