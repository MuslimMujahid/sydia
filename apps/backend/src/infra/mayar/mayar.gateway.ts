import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import {
  PaymentGatewayError,
  type CreatedInvoice,
  type PaymentGateway,
  type VerifiedInvoice,
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

  private async request(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
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
      return object(object(await response.json()).data);
    } catch {
      this.logger.error('Mayar returned an invalid response schema');
      throw new PaymentGatewayError('mayar_invalid_response', post);
    }
  }

  async createInvoice(
    input: Parameters<PaymentGateway['createInvoice']>[0],
  ): Promise<CreatedInvoice> {
    const data = await this.request('/invoices/create', {
      name: input.name,
      email: input.email,
      mobile: input.mobile,
      description: 'Sydia — 30 hari',
      expiredAt: input.expiresAt.toISOString(),
      items: [
        { quantity: 1, rate: input.amount, description: 'Sydia — 30 hari' },
      ],
      extraData: { orderId: input.orderId },
    });

    try {
      const link = string(data.link);
      const url = new URL(link);
      const expiresAt = new Date(
        typeof data.expiredAt === 'number'
          ? data.expiredAt
          : string(data.expiredAt),
      );

      if (url.protocol !== 'https:' || !Number.isFinite(expiresAt.getTime()))
        throw new Error('Invalid invoice checkout URL or expiry');

      return {
        id: string(data.id),
        transactionId: string(data.transactionId),
        link,
        expiresAt,
      };
    } catch {
      this.logger.error(
        'Invoice creation acknowledged but response cannot be correlated; review the order in Mayar',
      );
      throw new PaymentGatewayError('mayar_invoice_schema', true);
    }
  }

  async inspectInvoice(
    invoiceId: string,
    transactionId: string,
  ): Promise<VerifiedInvoice> {
    const invoice = await this.request(
      `/invoices/${encodeURIComponent(invoiceId)}`,
    );

    const transaction = await this.request(
      `/transactions/${encodeURIComponent(transactionId)}`,
    );

    try {
      const transactions = invoice.transactions;
      if (
        !Array.isArray(transactions) ||
        !transactions.some(
          (entry: unknown) => object(entry).id === transactionId,
        )
      )
        throw new Error('Invoice transaction mismatch');

      // V2 returns extraData as JSON text, although creation accepts an object.
      const extraData: unknown =
        typeof transaction.extraData === 'string'
          ? JSON.parse(transaction.extraData)
          : transaction.extraData;

      const orderReference =
        extraData == null ? null : object(extraData).orderId;

      return {
        orderReference:
          typeof orderReference === 'string' ? orderReference : null,
        invoiceId: string(invoice.id),
        transactionId: string(transaction.id),
        merchantId: string(invoice.userId),
        transactionMerchantId: string(object(transaction.user).id),
        invoiceAmount: amount(invoice.amount),
        amount: amount(transaction.amount),
        invoiceStatus: string(invoice.status),
        status: string(transaction.status),
        paymentLinkId: string(object(transaction.paymentLink).id),
        paymentMethod:
          typeof transaction.paymentMethod === 'string'
            ? transaction.paymentMethod
            : null,
      };
    } catch {
      this.logger.error(
        'Mayar invoice verification schema or correlation failed',
      );
      throw new PaymentGatewayError('mayar_verification_schema', false);
    }
  }
}
