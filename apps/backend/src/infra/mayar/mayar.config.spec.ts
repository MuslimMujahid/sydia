import { expect, test } from '@jest/globals';
import { validateBillingEnvironment } from './mayar.config';

test('checkout and enforcement remain explicitly disabled before rollout', () => {
  expect(validateBillingEnvironment({})).toMatchObject({
    BACKEND_BILLING_CHECKOUT_ENABLED: false,
    BACKEND_BILLING_ENFORCEMENT_ENABLED: false,
    BACKEND_BILLING_PRICE_IDR: 29_000,
  });
});
test('enforcement requires a stable rollout timestamp', () => {
  expect(() =>
    validateBillingEnvironment({ BACKEND_BILLING_ENFORCEMENT_ENABLED: 'true' }),
  ).toThrow('BACKEND_BILLING_ROLLOUT_AT');
});
test('checkout cannot accept money while enforcement is disabled', () => {
  expect(() =>
    validateBillingEnvironment({
      BACKEND_BILLING_CHECKOUT_ENABLED: 'true',
      BACKEND_BILLING_ROLLOUT_AT: '2026-10-22T00:00:00Z',
    }),
  ).toThrow('enforcement');
});
test('production checkout rejects an insecure callback origin', () => {
  expect(() =>
    validateBillingEnvironment({
      BACKEND_BILLING_CHECKOUT_ENABLED: 'true',
      BACKEND_BILLING_ENFORCEMENT_ENABLED: 'true',
      BACKEND_BILLING_ROLLOUT_AT: '2026-10-22T00:00:00Z',
      MAYAR_ENVIRONMENT: 'production',
      MAYAR_API_KEY: 'test-key',
      MAYAR_WEBHOOK_TOKEN: 'test-token',
      MAYAR_MERCHANT_ID: 'merchant',
      BACKEND_AUTH_URL: 'http://localhost:5000',
    }),
  ).toThrow('HTTPS');
});
