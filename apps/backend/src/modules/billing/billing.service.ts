import { recordBillingEvent } from './billing.telemetry';
import {
  BILLING_STORAGE_BYTES,
  BILLING_FILE_BYTES,
} from '../../shared/billing-policy';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BILLING_REPOSITORY,
  USER_REPOSITORY,
  type IBillingRepository,
  type IUserRepository,
} from '../../database/interfaces';
import type { BillingOrder } from '../../database/entities';
import {
  PAYMENT_GATEWAY,
  PaymentGatewayError,
  type PaymentGateway,
} from '../../infra/mayar';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { BillingAccessService } from './billing-access.service';

export function presentBillingOrder(order: BillingOrder) {
  return {
    id: order.id,
    amount: order.amount,
    durationDays: order.durationDays,
    status: order.status,
    paymentUrl: order.paymentUrl,
    paymentMethod: order.paymentMethod,
    expiresAt: order.expiresAt,
    appliedAt: order.appliedAt,
    createdAt: order.createdAt,
  };
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  constructor(
    @Inject(BILLING_REPOSITORY) private readonly repository: IBillingRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly access: BillingAccessService,
    private readonly config: ConfigService,
  ) {}

  get environment(): string {
    return this.config.getOrThrow<string>('MAYAR_ENVIRONMENT');
  }

  async initializeTrials(): Promise<number> {
    const rollout = this.config.getOrThrow<string>(
      'BACKEND_BILLING_ROLLOUT_AT',
    );

    if (!Number.isFinite(Date.parse(rollout)))
      throw new Error('Invalid billing rollout timestamp');

    return this.repository.initializeTrials(new Date(rollout), 7);
  }

  async status(userId: string) {
    const [access, usedBytes] = await Promise.all([
      this.access.snapshot(userId),
      this.repository.storageUsed(userId),
    ]);

    return {
      ...access,
      checkoutEnabled: this.config.get<boolean>(
        'BACKEND_BILLING_CHECKOUT_ENABLED',
        false,
      ),
      environment: this.environment,
      normalPrice: 59_000,
      price: this.config.getOrThrow<number>('BACKEND_BILLING_PRICE_IDR'),
      durationDays: 30,
      trialDays: 7,
      storage: {
        usedBytes,
        limitBytes: BILLING_STORAGE_BYTES,
        maxFileBytes: BILLING_FILE_BYTES,
      },
    };
  }

  async orders(userId: string) {
    return (await this.repository.listOrders(userId)).map(presentBillingOrder);
  }

  async checkout(
    userId: string,
    input: { idempotencyKey: string; mobile: string },
  ) {
    if (!this.config.get<boolean>('BACKEND_BILLING_CHECKOUT_ENABLED', false))
      throw new ApiException({
        code: ErrorCodes.SERVICE_UNAVAILABLE,
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Checkout belum tersedia. Hubungi dukungan Sydia.',
      });
    const user = await this.users.findById(userId);
    if (!user)
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
        message: 'Account no longer exists',
      });
    await this.access.snapshot(userId);
    const now = new Date();
    const { order, created } = await this.repository.createOrder({
      userId,
      environment: this.environment,
      idempotencyKey: input.idempotencyKey,
      amount: this.config.getOrThrow<number>('BACKEND_BILLING_PRICE_IDR'),
      now,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });

    if (!created) return presentBillingOrder(order);

    try {
      const invoice = await this.gateway.createInvoice({
        orderId: order.id,
        name: user.name,
        email: user.email,
        mobile: input.mobile,
        amount: order.amount,
        expiresAt: order.expiresAt,
      });

      await this.repository.attachInvoice(order.id, invoice);
    } catch (error) {
      const known = error instanceof PaymentGatewayError;
      const code = known ? error.code : 'invoice_persistence_unknown';
      // A successful provider write followed by a local failure is ambiguous too.
      await this.repository.markOrder(
        order.id,
        !known || error.ambiguous ? 'review' : 'failed',
        code,
        now,
      );
      recordBillingEvent('checkout_failed');
      this.logger.error(
        `billing.checkout_failed orderId=${order.id} code=${code}`,
      );
    }

    return this.requiredOrder(userId, order.id);
  }

  private async requiredOrder(userId: string, id: string) {
    const order = await this.repository.findOrder(userId, id);
    if (!order)
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
        message: 'Pesanan tidak ditemukan.',
      });

    return presentBillingOrder(order);
  }

  async refresh(userId: string, id: string) {
    const order = await this.repository.findOrder(userId, id);
    if (!order)
      throw new ApiException({
        code: ErrorCodes.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
        message: 'Pesanan tidak ditemukan.',
      });

    if (
      order.status === 'pending' ||
      (order.status === 'review' && order.providerInvoiceId)
    ) {
      try {
        await this.verify(order);
      } catch (error) {
        this.logger.error(
          `billing.refresh_failed orderId=${order.id} code=${error instanceof PaymentGatewayError ? error.code : 'unexpected_failure'}`,
        );
        if (!(error instanceof PaymentGatewayError)) throw error;
        throw new ApiException({
          code: ErrorCodes.SERVICE_UNAVAILABLE,
          status: HttpStatus.SERVICE_UNAVAILABLE,
          message:
            'Pemeriksaan pembayaran belum tersedia. Coba lagi sebentar; tagihan Anda tetap tersimpan. / Payment verification is unavailable. Please retry shortly; your invoice is saved.',
          details: { retryAfterSeconds: error.retryAfterSeconds },
        });
      }
    }

    return this.requiredOrder(userId, id);
  }

  async verify(order: BillingOrder): Promise<void> {
    if (
      !order.userId ||
      !order.providerInvoiceId ||
      !order.providerTransactionId ||
      order.appliedAt
    )
      return;
    const now = new Date();

    if (order.environment !== this.environment) {
      await this.repository.markOrder(
        order.id,
        'review',
        'environment_mismatch',
        now,
      );
      recordBillingEvent('verification_mismatch');
      this.logger.error(
        `billing.verification_mismatch orderId=${order.id} reason=environment`,
      );

      return;
    }

    const result = await this.gateway.inspectInvoice(
      order.providerInvoiceId,
      order.providerTransactionId,
    );

    const merchant = this.config.getOrThrow<string>('MAYAR_MERCHANT_ID');

    if (
      (result.orderReference !== null && result.orderReference !== order.id) ||
      result.invoiceId !== order.providerInvoiceId ||
      result.transactionId !== order.providerTransactionId ||
      result.paymentLinkId !== order.providerInvoiceId ||
      result.merchantId !== merchant ||
      result.transactionMerchantId !== merchant ||
      result.amount !== order.amount ||
      result.invoiceAmount !== order.amount
    ) {
      await this.repository.markOrder(
        order.id,
        'review',
        'verification_mismatch',
        now,
      );
      recordBillingEvent('verification_mismatch');
      this.logger.error(`billing.verification_mismatch orderId=${order.id}`);

      return;
    }

    if (result.status === 'paid' && result.invoiceStatus === 'paid') {
      if (
        await this.repository.applyPayment(
          order.id,
          order.providerTransactionId,
          now,
          result.paymentMethod,
        )
      ) {
        recordBillingEvent('payment_applied');
        this.logger.log(
          `billing.payment_applied orderId=${order.id} amount=${order.amount}`,
        );
      }
    } else if (
      now > order.expiresAt &&
      ['expired', 'closed'].includes(result.invoiceStatus)
    ) {
      await this.repository.markOrder(order.id, 'expired', null, now);
    } else {
      const stale =
        now.getTime() - order.createdAt.getTime() > 24 * 60 * 60_000;

      await this.repository.markOrder(
        order.id,
        stale ? 'review' : 'pending',
        stale ? 'unresolved_after_24h' : null,
        new Date(now.getTime() + 5 * 60_000),
      );
      if (stale) recordBillingEvent('order_review');
      if (stale)
        this.logger.error(`billing.order_needs_review orderId=${order.id}`);
    }
  }

  async recover(): Promise<void> {
    const receipts = await this.repository.pendingWebhooks();

    for (const receipt of receipts) {
      try {
        const order = await this.repository.findByProvider(
          receipt.environment,
          receipt.transactionId ?? undefined,
          receipt.invoiceId ?? undefined,
        );

        if (order) {
          await this.verify(order);
          await this.repository.completeWebhook(receipt.id, 'processed');
        } else if (
          Date.now() - receipt.receivedAt.getTime() >
          24 * 60 * 60_000
        ) {
          this.logger.warn(`billing.webhook_unmatched receiptId=${receipt.id}`);
          await this.repository.completeWebhook(receipt.id, 'unmatched');
        } else {
          await this.repository.completeWebhook(
            receipt.id,
            'pending',
            'unmatched_retry',
          );
        }
      } catch (error) {
        await this.recordRecoveryError(
          error,
          undefined,
          receipt.id,
          receipt.attempts,
        );
      }
    }

    for (const order of await this.repository.dueOrders(new Date())) {
      try {
        await this.verify(order);
      } catch (error) {
        await this.recordRecoveryError(
          error,
          order.id,
          undefined,
          order.attempts,
        );
      }
    }

    await this.repository.recoverStorageReservations();
  }

  private async recordRecoveryError(
    error: unknown,
    orderId?: string,
    receiptId?: string,
    attempts = 0,
  ) {
    const code =
      error instanceof PaymentGatewayError
        ? error.code
        : 'billing_recovery_failed';

    recordBillingEvent('recovery_failed');
    this.logger.error(
      `billing.recovery_failed orderId=${orderId ?? 'none'} receiptId=${receiptId ?? 'none'} code=${code}`,
    );
    if (receiptId)
      await this.repository.completeWebhook(
        receiptId,
        attempts >= 288 ? 'review' : 'pending',
        code,
      );

    if (orderId) {
      const retrySeconds =
        error instanceof PaymentGatewayError
          ? Math.max(300, error.retryAfterSeconds)
          : 300;

      await this.repository.markOrder(
        orderId,
        attempts >= 288 ? 'review' : 'pending',
        code,
        new Date(Date.now() + retrySeconds * 1000),
      );
    }
  }
}
