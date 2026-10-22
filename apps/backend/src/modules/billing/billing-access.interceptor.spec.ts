import { expect, jest, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { billingRepositoryFixture } from '../../../test/support/billing-fixtures';
import { BillingAccessService } from './billing-access.service';
import {
  AllowInactiveBilling,
  BillingAccessInterceptor,
} from './billing-access.interceptor';

function runtime(method: string, allowed = false) {
  const repository = billingRepositoryFixture({
    ensureAccount: () =>
      Promise.resolve({
        userId: 'owner',
        trialStartsAt: new Date(0),
        trialEndsAt: new Date(1),
        paidUntil: null,
        lastActivatedAt: null,
      }),
  });

  const access = new BillingAccessService(
    repository,
    new ConfigService({
      BACKEND_BILLING_ENFORCEMENT_ENABLED: true,
      BACKEND_BILLING_ROLLOUT_AT: '2026-10-22T00:00:00Z',
      FRONTEND_URL: 'http://localhost:3000',
    }),
  );

  class Controller {}
  if (allowed) AllowInactiveBilling()(Controller);
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        user: { id: 'owner', locale: 'en', role: 'user' },
      }),
    }),
    getClass: () => Controller,
    getHandler: () => Controller,
  } as unknown as ExecutionContext;

  const next = { handle: jest.fn(() => of('allowed')) };

  return {
    interceptor: new BillingAccessInterceptor(access, new Reflector()),
    context,
    next,
  };
}

test('expired accounts cannot mutate product data', async () => {
  const { interceptor, context, next } = runtime('POST');
  await expect(interceptor.intercept(context, next)).rejects.toMatchObject({
    code: 'BILLING_REQUIRED',
  });
  expect(next.handle).not.toHaveBeenCalled();
});
test.each(['GET', 'DELETE'])(
  'expired accounts retain %s access',
  async (method) => {
    const { interceptor, context, next } = runtime(method);
    await interceptor.intercept(context, next);
    expect(next.handle).toHaveBeenCalledTimes(1);
  },
);
test('account management, billing and POST-based deletion remain accessible', async () => {
  const { interceptor, context, next } = runtime('POST', true);
  await interceptor.intercept(context, next);
  expect(next.handle).toHaveBeenCalledTimes(1);
});
