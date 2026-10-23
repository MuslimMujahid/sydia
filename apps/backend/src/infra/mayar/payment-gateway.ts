export const PAYMENT_GATEWAY = Symbol('PaymentGateway');
export type CreatedInvoice = {
  id: string;
  /** Mayar creates the transaction only once the customer starts paying. */
  transactionId: string | null;
  link: string;
  /** Rupiah due for the billing term, as priced by the Mayar membership tier. */
  amount: number;
  expiresAt: Date;
};
export type VerifiedPayment = {
  invoiceId: string;
  merchantId: string;
  amount: number;
  invoiceStatus: string;
  /** The paid transaction against the invoice; absent until the customer pays. */
  transaction: {
    id: string;
    merchantId: string;
    amount: number;
    status: string;
    /** Provider channel such as `qris` or `ewallet/DANA`; absent on older data. */
    paymentMethod: string | null;
  } | null;
};
export interface PaymentGateway {
  /** Returns the member code for this customer, registering them on first use. */
  ensureMember(input: {
    name: string;
    email: string;
    mobile: string;
  }): Promise<string>;
  createInvoice(input: { memberId: string }): Promise<CreatedInvoice>;
  inspectPayment(invoiceId: string): Promise<VerifiedPayment>;
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
