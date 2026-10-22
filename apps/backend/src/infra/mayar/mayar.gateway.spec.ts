import { afterEach, expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { MayarGateway } from './mayar.gateway';

let gateway: MayarGateway | undefined;
afterEach(() => {
  gateway?.onModuleDestroy();
  jest.restoreAllMocks();
});

function runtime() {
  jest.spyOn(Redis.prototype, 'eval').mockResolvedValue(0);
  gateway = new MayarGateway(
    new ConfigService({
      MAYAR_API_KEY: 'fixture-key',
      MAYAR_ENVIRONMENT: 'sandbox',
      BACKEND_REDIS_URL: 'redis://localhost:6379',
    }),
  );

  return gateway;
}

test('invoice creation sends item pricing and a local order reference to V2 sandbox', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        data: {
          id: 'invoice',
          transactionId: 'transaction',
          link: 'https://merchant.myr.id/invoices/test',
          expiredAt: 1793492100000,
        },
      }),
    ),
  );

  await runtime().createInvoice({
    orderId: 'order',
    name: 'Customer',
    email: 'customer@example.test',
    mobile: '+6281234567890',
    amount: 29_000,
    expiresAt: new Date('2026-11-01T00:15:00Z'),
  });
  expect(fetch).toHaveBeenCalledWith(
    'https://api.mayar.io/hl/v2/invoices/create',
    expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"extraData":{"orderId":"order"}'),
    }),
  );
  const requestBody = fetch.mock.calls[0]?.[1]?.body;
  if (typeof requestBody !== 'string')
    throw new Error('Invoice body must be JSON text');
  const body = JSON.parse(requestBody) as {
    items: unknown;
  };

  expect(body.items).toEqual([
    { quantity: 1, rate: 29_000, description: 'Sydia — 30 hari' },
  ]);
});
test('network failure during creation is explicitly ambiguous', async () => {
  jest
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('Connection lost'));
  await expect(
    runtime().createInvoice({
      orderId: 'order',
      name: 'Customer',
      email: 'customer@example.test',
      mobile: '+6281234567890',
      amount: 29_000,
      expiresAt: new Date('2026-11-01T00:15:00Z'),
    }),
  ).rejects.toMatchObject({ ambiguous: true, code: 'mayar_transport_error' });
});
test('unavailable limiter prevents provider writes', async () => {
  const service = runtime();
  jest
    .spyOn(Redis.prototype, 'eval')
    .mockRejectedValue(new Error('Redis unavailable'));
  const fetch = jest.spyOn(globalThis, 'fetch');
  await expect(
    service.createInvoice({
      orderId: 'order',
      name: 'Customer',
      email: 'customer@example.test',
      mobile: '+6281234567890',
      amount: 29_000,
      expiresAt: new Date('2026-11-01T00:15:00Z'),
    }),
  ).rejects.toMatchObject({
    ambiguous: false,
    code: 'mayar_limiter_unavailable',
  });
  expect(fetch).not.toHaveBeenCalled();
});
test('transaction verification requires the transaction to belong to the invoice', async () => {
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            id: 'invoice',
            userId: 'merchant',
            amount: 29_000,
            status: 'paid',
            transactions: [{ id: 'another-transaction' }],
          },
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            id: 'transaction',
            amount: 29_000,
            status: 'paid',
            user: { id: 'merchant' },
            paymentLink: { id: 'invoice' },
          },
        }),
      ),
    );
  await expect(
    runtime().inspectInvoice('invoice', 'transaction'),
  ).rejects.toMatchObject({ code: 'mayar_verification_schema' });
});

test('V2 verification decodes the JSON-text local reference returned by Mayar', async () => {
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            id: 'invoice',
            userId: 'merchant',
            amount: 29_000,
            status: 'paid',
            transactions: [{ id: 'transaction' }],
          },
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            id: 'transaction',
            amount: 29_000,
            status: 'paid',
            user: { id: 'merchant' },
            paymentLink: { id: 'invoice' },
            extraData: '{"orderId":"order"}',
          },
        }),
      ),
    );
  expect(await runtime().inspectInvoice('invoice', 'transaction')).toEqual({
    orderReference: 'order',
    invoiceId: 'invoice',
    transactionId: 'transaction',
    merchantId: 'merchant',
    transactionMerchantId: 'merchant',
    invoiceAmount: 29_000,
    amount: 29_000,
    invoiceStatus: 'paid',
    status: 'paid',
    paymentLinkId: 'invoice',
  });
});
