import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BILLING_REPOSITORY,
  USER_REPOSITORY,
  type IBillingRepository,
  type IUserRepository,
} from '../../database/interfaces';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../../infra/mayar';
import { ApiException, ErrorCodes } from '../../shared/errors';
import { presentBillingOrder } from './billing.service';

@Injectable()
export class BillingOperationsService {
  private readonly logger = new Logger(BillingOperationsService.name);
  constructor(
    @Inject(BILLING_REPOSITORY) private readonly repository: IBillingRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly config: ConfigService,
  ) {}

  async reviews() {
    return (await this.repository.reviewOrders()).map(presentBillingOrder);
  }

  private async admin(actorId: string) {
    if ((await this.users.findById(actorId))?.role !== 'admin')
      throw new ApiException({
        code: ErrorCodes.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
        message: 'An existing admin actor is required for billing corrections',
      });
  }

  async linkInvoice(
    orderId: string,
    invoiceId: string,
    transactionId: string,
    actorId: string,
  ) {
    await this.admin(actorId);
    const order = await this.repository.reviewOrder(orderId);
    if (!order?.userId)
      throw new Error('Review order or its owner no longer exists');
    if (
      order.environment !== this.config.getOrThrow<string>('MAYAR_ENVIRONMENT')
    )
      throw new Error('Review must use the order environment');
    const result = await this.gateway.inspectPayment(invoiceId);
    const merchant = this.config.getOrThrow<string>('MAYAR_MERCHANT_ID');
    if (
      result.invoiceId !== invoiceId ||
      result.merchantId !== merchant ||
      result.amount !== order.amount ||
      result.invoiceStatus !== 'paid' ||
      result.transaction?.id !== transactionId ||
      result.transaction.status !== 'paid' ||
      result.transaction.merchantId !== merchant ||
      result.transaction.amount !== order.amount
    )
      throw new Error(
        'Invoice does not match a verified paid transaction for this order; nothing was applied',
      );
    if (
      !(await this.repository.linkReviewedInvoice(
        orderId,
        invoiceId,
        transactionId,
        actorId,
      ))
    )
      throw new Error(
        'Review order changed concurrently; inspect its current state',
      );
    await this.repository.applyPayment(
      orderId,
      transactionId,
      new Date(),
      result.transaction.paymentMethod,
    );
    this.logger.log(`billing.review_resolved orderId=${orderId}`);
  }

  /** Fills the payment method on paid orders that were applied before it was stored. */
  async backfillPaymentMethods(): Promise<number> {
    let filled = 0;

    for (const order of await this.repository.paidOrdersWithoutMethod()) {
      if (!order.providerInvoiceId) continue;
      if (
        order.environment !==
        this.config.getOrThrow<string>('MAYAR_ENVIRONMENT')
      )
        continue;
      const { transaction } = await this.gateway.inspectPayment(
        order.providerInvoiceId,
      );

      if (transaction?.status !== 'paid' || !transaction.paymentMethod)
        continue;
      await this.repository.setPaymentMethod(
        order.id,
        transaction.paymentMethod,
      );
      filled += 1;
    }

    return filled;
  }

  async closeUnpaid(orderId: string, actorId: string, reason: string) {
    await this.admin(actorId);
    if (reason.trim().length < 10 || reason.length > 300)
      throw new Error(
        'Document the dashboard evidence in a 10–300 character reason, without customer contact data',
      );
    if (!(await this.repository.closeReviewedOrder(orderId, actorId, reason)))
      throw new Error('Order is no longer awaiting review');
    this.logger.warn(`billing.review_closed_unpaid orderId=${orderId}`);
  }
}
