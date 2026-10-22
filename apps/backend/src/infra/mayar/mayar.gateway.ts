import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import {
  PaymentGatewayError,
  type CreatedInvoice,
  type PaymentGateway,
  type VerifiedPayment,
} from './payment-gateway';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid Mayar response object');

  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Missing Mayar response identifier');

  return value;
}

function amount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw new Error('Invalid Mayar amount');

  return value;
}

const RESERVE_REQUEST = `
local t = redis.call('TIME')
local now = tonumber(t[1])*1000 + math.floor(tonumber(t[2])/1000)
local blocked = tonumber(redis.call('GET', KEYS[2]) or '0')
if blocked > now then return math.ceil((blocked-now)/1000) end
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now-60000)
if redis.call('ZCARD', KEYS[1]) >= 45 then return 60 end
redis.call('ZADD', KEYS[1], now, ARGV[1])
redis.call('PEXPIRE', KEYS[1], 61000)
return 0
`;

@Injectable()
export class MayarGateway implements PaymentGateway, OnModuleDestroy {
  private readonly logger = new Logger(MayarGateway.name);
  private readonly redis: Redis;
  private readonly baseUrl: string;
  private readonly key: string;
  private readonly limiter: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl =
      config.get<string>('MAYAR_ENVIRONMENT', 'sandbox') === 'production'
        ? 'https://api.mayar.id/hl/v2'
        : 'https://api.mayar.io/hl/v2';
    this.key = config.get<string>('MAYAR_API_KEY', '');
    this.limiter = `mayar:${createHash('sha256').update(this.key).digest('hex')}`;
    this.redis = new Redis(config.getOrThrow<string>('BACKEND_REDIS_URL'), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    this.redis.on('error', () =>
      this.logger.error(
        'Mayar request limiter unavailable; check BACKEND_REDIS_URL',
      ),
    );
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  private async requestObject(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const data = await this.request(path, body);

    try {
      return object(data);
    } catch {
      this.logger.error('Mayar returned an invalid response schema');
      throw new PaymentGatewayError(
        'mayar_invalid_response',
        body !== undefined,
      );
    }
  }

  private async request(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const post = body !== undefined;
    if (!this.key) throw new PaymentGatewayError('mayar_not_configured', false);
    let wait: number;

    try {
      wait = Number(
        await this.redis.eval(
          RESERVE_REQUEST,
          2,
          `${this.limiter}:requests`,
          `${this.limiter}:blocked`,
          randomUUID(),
        ),
      );
    } catch {
      this.logger.error('Mayar admission failed before sending a request');
      throw new PaymentGatewayError('mayar_limiter_unavailable', false);
    }

    if (!Number.isFinite(wait))
      throw new PaymentGatewayError('mayar_limiter_invalid', false);
    if (wait > 0)
      throw new PaymentGatewayError('mayar_rate_limited', false, wait);

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: post ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${this.key}`,
          'Content-Type': 'application/json',
        },
        ...(post ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });
    } catch {
      this.logger.error(
        `Mayar transport failure method=${post ? 'POST' : 'GET'}`,
      );
      throw new PaymentGatewayError('mayar_transport_error', post);
    }

    if (!response.ok) {
      this.logger.warn(`Mayar request rejected status=${response.status}`);
      const retry = Math.max(
        1,
        Number(response.headers.get('retry-after')) || 60,
      );

      if (response.status === 429)
        await this.redis.set(
          `${this.limiter}:blocked`,
          Date.now() + retry * 1000,
          'PX',
          retry * 1000,
        );
      throw new PaymentGatewayError(
        `mayar_http_${response.status}`,
        post &&
          (response.status >= 500 ||
            response.status === 429 ||
            response.status === 409 ||
            response.status === 408),
        retry,
      );
    }

    try {
      return object(await response.json()).data;
    } catch {
      this.logger.error('Mayar returned an invalid response schema');
      throw new PaymentGatewayError('mayar_invalid_response', post);
    }
  }

  private get productId(): string {
    return this.config.getOrThrow<string>('MAYAR_MEMBERSHIP_PRODUCT_ID');
  }

  private async findMemberByEmail(email: string): Promise<string | null> {
    const data = await this.request(
      `/memberships/members?productId=${encodeURIComponent(this.productId)}&limit=50&searchTerm=${encodeURIComponent(email)}`,
    );

    if (!Array.isArray(data)) return null;

    for (const entry of data) {
      const member = object(entry);
      const customer = member.customer;

      if (
        customer &&
        typeof customer === 'object' &&
        typeof (customer as Record<string, unknown>).email === 'string' &&
        (
          (customer as Record<string, unknown>).email as string
        ).toLowerCase() === email.toLowerCase() &&
        typeof member.memberId === 'string' &&
        member.memberId.trim()
      )
        return member.memberId;
    }

    return null;
  }

  async ensureMember(
    input: Parameters<PaymentGateway['ensureMember']>[0],
  ): Promise<string> {
    try {
      const data = await this.requestObject('/memberships/members/create', {
        productId: this.productId,
        membershipTierId: this.config.getOrThrow<string>(
          'MAYAR_MEMBERSHIP_TIER_ID',
        ),
        membershipMonthlyPeriod: 1,
        customerInfo: {
          name: input.name,
          email: input.email,
          mobile: input.mobile,
        },
      });

      // Sandbox returns the member record directly; the docs nest it.
      return string(object(data.membershipCustomer ?? data).memberId);
    } catch (error) {
      // Registration is repeatable: a member that already exists is looked up
      // rather than duplicated, so a failure here never needs manual review.
      if (
        error instanceof PaymentGatewayError &&
        error.code === 'mayar_http_400'
      ) {
        const existing = await this.findMemberByEmail(input.email);

        if (existing) return existing;
      }

      if (error instanceof PaymentGatewayError)
        throw new PaymentGatewayError(
          error.code,
          false,
          error.retryAfterSeconds,
        );
      this.logger.error('Mayar member registration response unreadable');
      throw new PaymentGatewayError('mayar_member_schema', false);
    }
  }

  async createInvoice(
    input: Parameters<PaymentGateway['createInvoice']>[0],
  ): Promise<CreatedInvoice> {
    const data = await this.requestObject(
      `/memberships/members/${encodeURIComponent(input.memberId)}/invoice/create`,
      { productId: this.productId },
    );

    let created: Omit<CreatedInvoice, 'expiresAt'>;

    try {
      const link = string(data.membershipBillUrl);

      if (new URL(link).protocol !== 'https:')
        throw new Error('Invalid invoice checkout URL');
      created = {
        id: string(data.id),
        transactionId:
          typeof data.transactionId === 'string' && data.transactionId
            ? data.transactionId
            : null,
        link,
        amount: amount(data.amount),
      };
    } catch {
      this.logger.error(
        'Invoice creation acknowledged but response cannot be correlated; review the order in Mayar',
      );
      throw new PaymentGatewayError('mayar_invoice_schema', true);
    }

    return { ...created, expiresAt: await this.invoiceExpiry(created.id) };
  }

  /** The creation response omits the expiry, which only the invoice itself reports. */
  private async invoiceExpiry(invoiceId: string): Promise<Date> {
    try {
      const invoice = await this.requestObject(
        `/invoices/${encodeURIComponent(invoiceId)}`,
      );

      const expiresAt = new Date(
        typeof invoice.expiredAt === 'number'
          ? invoice.expiredAt
          : string(invoice.expiredAt),
      );

      if (Number.isFinite(expiresAt.getTime())) return expiresAt;
    } catch {
      this.logger.warn('Mayar invoice expiry unavailable; using a short hold');
    }

    return new Date(Date.now() + 60 * 60_000);
  }

  async inspectPayment(invoiceId: string): Promise<VerifiedPayment> {
    const invoice = await this.requestObject(
      `/invoices/${encodeURIComponent(invoiceId)}`,
    );

    let result: VerifiedPayment;
    let transactionIds: string[];

    try {
      result = {
        invoiceId: string(invoice.id),
        merchantId: string(invoice.userId),
        amount: amount(invoice.amount),
        invoiceStatus: string(invoice.status),
        transaction: null,
      };
      transactionIds = Array.isArray(invoice.transactions)
        ? invoice.transactions.map((entry: unknown) => string(object(entry).id))
        : [];
    } catch {
      this.logger.error('Mayar invoice verification schema failed');
      throw new PaymentGatewayError('mayar_verification_schema', false);
    }

    // A customer may retry a failed attempt, so settle on the transaction that paid.
    for (const id of transactionIds.slice(0, 5)) {
      const transaction = await this.requestObject(
        `/transactions/${encodeURIComponent(id)}`,
      );

      try {
        const verified = {
          id: string(transaction.id),
          merchantId: string(object(transaction.user).id),
          amount: amount(transaction.amount),
          status: string(transaction.status),
          paymentMethod:
            typeof transaction.paymentMethod === 'string'
              ? transaction.paymentMethod
              : null,
        };

        if (!result.transaction || verified.status === 'paid')
          result.transaction = verified;
        if (verified.status === 'paid') break;
      } catch {
        this.logger.error('Mayar transaction verification schema failed');
        throw new PaymentGatewayError('mayar_verification_schema', false);
      }
    }

    return result;
  }
}
