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
    const result = await this.gateway.inspectInvoice(invoiceId, transactionId);
    const merchant = this.config.getOrThrow<string>('MAYAR_MERCHANT_ID');
    if (
      result.orderReference !== order.id ||
      result.invoiceId !== invoiceId ||
      result.transactionId !== transactionId ||
      result.paymentLinkId !== invoiceId ||
      result.merchantId !== merchant ||
      result.transactionMerchantId !== merchant ||
      result.amount !== order.amount ||
      result.invoiceAmount !== order.amount ||
      result.status !== 'paid' ||
      result.invoiceStatus !== 'paid'
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
    await this.repository.applyPayment(orderId, transactionId, new Date());
    this.logger.log(`billing.review_resolved orderId=${orderId}`);
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
