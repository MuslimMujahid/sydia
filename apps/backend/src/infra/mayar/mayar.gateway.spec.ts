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
      MAYAR_MEMBERSHIP_PRODUCT_ID: 'product',
      MAYAR_MEMBERSHIP_TIER_ID: 'tier',
      BACKEND_REDIS_URL: 'redis://localhost:6379',
    }),
  );

  return gateway;
}

test('invoice creation bills the member of the membership product on V2 sandbox', async () => {
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            id: 'invoice',
            status: 'unpaid',
            amount: 29_000,
            membershipBillUrl: 'https://merchant.mayar.shop/pl/test',
          },
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: { id: 'invoice', expiredAt: 1793492100000 } }),
      ),
    );

  expect(await runtime().createInvoice({ memberId: 'MBR8X2QK' })).toEqual({
    id: 'invoice',
    transactionId: null,
    link: 'https://merchant.mayar.shop/pl/test',
    amount: 29_000,
    expiresAt: new Date(1793492100000),
  });
  expect(fetch).toHaveBeenCalledWith(
    'https://api.mayar.io/hl/v2/memberships/members/MBR8X2QK/invoice/create',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ productId: 'product' }),
    }),
  );
});
test('an unreadable expiry falls back to a short hold instead of failing checkout', async () => {
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            id: 'invoice',
            amount: 29_000,
            membershipBillUrl: 'https://merchant.mayar.shop/pl/test',
          },
        }),
      ),
    )
    .mockResolvedValueOnce(new Response('{}', { status: 503 }));
  await expect(
    runtime().createInvoice({ memberId: 'MBR8X2QK' }),
  ).resolves.toMatchObject({ id: 'invoice' });
});
test('network failure during creation is explicitly ambiguous', async () => {
  jest
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('Connection lost'));
  await expect(
    runtime().createInvoice({ memberId: 'MBR8X2QK' }),
  ).rejects.toMatchObject({ ambiguous: true, code: 'mayar_transport_error' });
});
test('unavailable limiter prevents provider writes', async () => {
  const service = runtime();
  jest
    .spyOn(Redis.prototype, 'eval')
    .mockRejectedValue(new Error('Redis unavailable'));
  const fetch = jest.spyOn(globalThis, 'fetch');
  await expect(
    service.createInvoice({ memberId: 'MBR8X2QK' }),
  ).rejects.toMatchObject({
    ambiguous: false,
    code: 'mayar_limiter_unavailable',
  });
  expect(fetch).not.toHaveBeenCalled();
});
test('member registration sends the tier and the customer to V2 sandbox', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        data: { memberId: 'MBR8X2QK', status: 'active' },
      }),
    ),
  );

  await expect(
    runtime().ensureMember({
      name: 'Customer',
      email: 'customer@example.test',
      mobile: '+6281234567890',
    }),
  ).resolves.toBe('MBR8X2QK');
  expect(fetch).toHaveBeenCalledWith(
    'https://api.mayar.io/hl/v2/memberships/members/create',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        productId: 'product',
        membershipTierId: 'tier',
        membershipMonthlyPeriod: 1,
        customerInfo: {
          name: 'Customer',
          email: 'customer@example.test',
          mobile: '+6281234567890',
        },
      }),
    }),
  );
});
test('an already registered customer is found by email instead of failing checkout', async () => {
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response('{}', { status: 400 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            { memberId: 'OTHER', customer: { email: 'other@example.test' } },
            {
              memberId: 'MBR8X2QK',
              customer: { email: 'Customer@Example.test' },
            },
          ],
        }),
      ),
    );
  await expect(
    runtime().ensureMember({
      name: 'Customer',
      email: 'customer@example.test',
      mobile: '+6281234567890',
    }),
  ).resolves.toBe('MBR8X2QK');
});
test('a registration failure is never ambiguous because it can be repeated', async () => {
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('{}', { status: 503 }));
  await expect(
    runtime().ensureMember({
      name: 'Customer',
      email: 'customer@example.test',
      mobile: '+6281234567890',
    }),
  ).rejects.toMatchObject({ ambiguous: false, code: 'mayar_http_503' });
});
test('payment inspection reads the invoice and the transaction that paid it', async () => {
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
            transactions: [{ id: 'failed' }, { id: 'transaction' }],
          },
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            id: 'failed',
            amount: 29_000,
            status: 'failed',
            user: { id: 'merchant' },
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
            paymentMethod: 'qris',
          },
        }),
      ),
    );
  expect(await runtime().inspectPayment('invoice')).toEqual({
    invoiceId: 'invoice',
    merchantId: 'merchant',
    amount: 29_000,
    invoiceStatus: 'paid',
    transaction: {
      id: 'transaction',
      merchantId: 'merchant',
      amount: 29_000,
      status: 'paid',
      paymentMethod: 'qris',
    },
  });
});
test('an unpaid invoice has no transaction yet', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        data: {
          id: 'invoice',
          userId: 'merchant',
          amount: 29_000,
          status: 'unpaid',
          transactions: [],
        },
      }),
    ),
  );
  expect(await runtime().inspectPayment('invoice')).toMatchObject({
    invoiceStatus: 'unpaid',
    transaction: null,
  });
});
test('an invoice without its merchant is rejected as unverifiable', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        data: { id: 'invoice', amount: 29_000, status: 'paid' },
      }),
    ),
  );
  await expect(runtime().inspectPayment('invoice')).rejects.toMatchObject({
    code: 'mayar_verification_schema',
  });
});
