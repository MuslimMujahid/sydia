import { BILLING_TRIAL_DAYS } from '../../shared/billing-policy';
import { recordBillingEvent } from './billing.telemetry';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BILLING_REPOSITORY,
  type IBillingRepository,
} from '../../database/interfaces';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { getFrontendOrigins } from '../../shared/frontend-origins';

@Injectable()
export class BillingAccessService {
  private readonly logger = new Logger(BillingAccessService.name);
  constructor(
    @Inject(BILLING_REPOSITORY) private readonly repository: IBillingRepository,
    private readonly config: ConfigService,
  ) {}

  get enforced(): boolean {
    return this.config.get<boolean>(
      'BACKEND_BILLING_ENFORCEMENT_ENABLED',
      false,
    );
  }

  get billingUrl(): string {
    const origin = getFrontendOrigins(
      this.config.getOrThrow<string>('FRONTEND_URL'),
    )[0];

    if (!origin) throw new Error('Billing requires a frontend origin');

    return new URL('/settings/billing', origin).toString();
  }

  message(locale: string): string {
    return locale === 'en'
      ? `Your Sydia access has expired. Your data remains available to read, download, and delete. Renew at ${this.billingUrl}`
      : `Masa aktif Sydia Anda telah habis. Data tetap bisa dibaca, diunduh, dan dihapus. Perpanjang di ${this.billingUrl}`;
  }

  async snapshot(userId: string, now = new Date()) {
    const rollout = this.config.get<string>('BACKEND_BILLING_ROLLOUT_AT');

    if (!rollout) {
      if (this.enforced)
        throw new Error('Billing rollout timestamp is missing');

      return {
        enforced: false,
        active: true,
        state: 'disabled' as const,
        trialEndsAt: null,
        paidUntil: null,
        lastActivatedAt: null,
      };
    }

    const account = await this.repository.ensureAccount(
      userId,
      new Date(rollout),
      BILLING_TRIAL_DAYS,
    );

    if (!account) {
      this.logger.warn('Billing access requested for a deleted account');
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
        message: 'Account no longer exists',
      });
    }

    const paid = account.paidUntil !== null && account.paidUntil > now;
    // A rollout scheduled in the future must not lock anyone out beforehand:
    // until the trial starts, the account keeps the access it already had.
    const trial = account.trialEndsAt > now;

    return {
      enforced: this.enforced,
      active: !this.enforced || paid || trial,
      state: paid
        ? ('paid' as const)
        : trial
          ? ('trial' as const)
          : ('expired' as const),
      trialEndsAt: account.trialEndsAt,
      paidUntil: account.paidUntil,
      lastActivatedAt: account.lastActivatedAt,
    };
  }

  async isActive(userId: string): Promise<boolean> {
    if (!this.enforced) return true;

    return (await this.snapshot(userId)).active;
  }

  async assertActive(userId: string, locale = 'id'): Promise<void> {
    if (await this.isActive(userId)) return;
    recordBillingEvent('access_denied');
    this.logger.warn(`billing.access_denied userId=${userId}`);
    const error = new ApiException({
      code: ErrorCodes.BILLING_REQUIRED,
      status: HttpStatus.PAYMENT_REQUIRED,
      message: this.message(locale),
      details: { billingUrl: this.billingUrl },
    });

    error.message = this.message(locale);
    throw error;
  }
}
