import { expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { billingRepositoryFixture } from '../../../test/support/billing-fixtures';
import { BillingWebhookController } from './billing-webhook.controller';

function runtime() {
  const repository = billingRepositoryFixture({
    receiveWebhook: jest.fn(() => Promise.resolve(undefined)),
  });

  const controller = new BillingWebhookController(
    new ConfigService({
      MAYAR_WEBHOOK_TOKEN: 'test-token',
      MAYAR_ENVIRONMENT: 'sandbox',
      MAYAR_MEMBERSHIP_PRODUCT_ID: 'membership-product',
    }),
    repository,
  );

  return { controller, repository };
}

test('invalid callback token is rejected without persisting an event', async () => {
  const { controller, repository } = runtime();
  await expect(
    controller.receive('bad-token', { event: 'payment.received' }),
  ).rejects.toMatchObject({ status: 401 });
  expect(repository.receiveWebhook).not.toHaveBeenCalled();
});
test('payment receipt persists routing hints without customer data or claimed status', async () => {
  const { controller, repository } = runtime();
  await controller.receive('test-token', {
    event: 'payment.received',
    data: {
      transactionId: 'tx-1',
      productId: 'invoice-1',
      status: 'SUCCESS',
      customerEmail: 'private@example.test',
    },
  });
  expect(repository.receiveWebhook).toHaveBeenCalledWith({
    id: expect.any(String),
    event: 'payment.received',
    environment: 'sandbox',
    transactionId: 'tx-1',
    invoiceId: 'invoice-1',
  });
});
test('duplicate deliveries produce the same durable receipt identity', async () => {
  const { controller, repository } = runtime();
  await controller.receive('test-token', {
    event: 'payment.received',
    data: { transactionId: 'tx-1' },
  });
  await controller.receive('test-token', {
    event: 'payment.received',
    data: { transactionId: 'tx-1', status: 'SUCCESS' },
  });
  const calls = jest.mocked(repository.receiveWebhook).mock.calls;
  expect(calls[0]?.[0].id).toBe(calls[1]?.[0].id);
});
test('Mayar test events cannot activate access or enter the payment inbox', async () => {
  const { controller, repository } = runtime();
  await expect(
    controller.receive('test-token', { event: 'testing', createdAt: 1 }),
  ).resolves.toEqual({ received: true, ignored: true });
  expect(repository.receiveWebhook).not.toHaveBeenCalled();
});
test('a membership payment is routed by transaction, never by the shared product id', async () => {
  const { controller, repository } = runtime();
  await controller.receive('test-token', {
    event: 'payment.received',
    data: { transactionId: 'tx-1', productId: 'membership-product' },
  });
  expect(repository.receiveWebhook).toHaveBeenCalledWith(
    expect.objectContaining({ transactionId: 'tx-1', invoiceId: null }),
  );
});
