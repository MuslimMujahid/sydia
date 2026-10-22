export const PAYMENT_GATEWAY = Symbol('PaymentGateway');
export type CreatedInvoice = {
  id: string;
  transactionId: string;
  link: string;
  expiresAt: Date;
};
export type VerifiedInvoice = {
  orderReference: string | null;
  invoiceId: string;
  transactionId: string;
  merchantId: string;
  transactionMerchantId: string;
  invoiceAmount: number;
  amount: number;
  invoiceStatus: string;
  status: string;
  paymentLinkId: string;
};
export interface PaymentGateway {
  createInvoice(input: {
    orderId: string;
    name: string;
    email: string;
    mobile: string;
    amount: number;
    expiresAt: Date;
  }): Promise<CreatedInvoice>;
  inspectInvoice(
    invoiceId: string,
    transactionId: string,
  ): Promise<VerifiedInvoice>;
}
export class PaymentGatewayError extends Error {
  constructor(
    readonly code: string,
    readonly ambiguous: boolean,
    readonly retryAfterSeconds = 60,
  ) {
    super(code);
    this.name = 'PaymentGatewayError';
  }
}
