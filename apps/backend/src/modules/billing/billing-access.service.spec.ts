import { describe, expect, test } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { billingRepositoryFixture } from '../../../test/support/billing-fixtures';
import type { BillingAccount } from '../../database/entities';
import { BillingAccessService } from './billing-access.service';

const now = new Date('2026-10-22T04:51:00Z');

function service(account: Partial<BillingAccount>, enforced = true) {
  const repository = billingRepositoryFixture({
    ensureAccount: () =>
      Promise.resolve({
        userId: 'owner',
        trialStartsAt: new Date('2026-10-22T00:00:00Z'),
        trialEndsAt: new Date('2026-10-29T00:00:00Z'),
        paidUntil: null,
        lastActivatedAt: new Date('2026-10-22T00:00:00Z'),
        ...account,
      }),
  });

  return new BillingAccessService(
    repository,
    new ConfigService({
      BACKEND_BILLING_ENFORCEMENT_ENABLED: enforced,
      BACKEND_BILLING_ROLLOUT_AT: '2026-10-22T00:00:00Z',
      FRONTEND_URL: 'http://localhost:3000',
    }),
  );
}

describe('billing access snapshot', () => {
  test('a running trial is active', async () => {
    await expect(service({}).snapshot('owner', now)).resolves.toMatchObject({
      state: 'trial',
      active: true,
    });
  });

  test('a trial that has not started yet does not lock the account', async () => {
    // Rollout scheduled after the current time, with enforcement already on.
    const upcoming = service({
      trialStartsAt: new Date('2026-10-22T05:00:00Z'),
      trialEndsAt: new Date('2026-10-29T05:00:00Z'),
    });

    await expect(upcoming.snapshot('owner', now)).resolves.toMatchObject({
      state: 'trial',
      active: true,
    });
  });

  test('an ended trial is expired and read-only', async () => {
    const ended = service({ trialEndsAt: new Date('2026-10-22T04:00:00Z') });

    await expect(ended.snapshot('owner', now)).resolves.toMatchObject({
      state: 'expired',
      active: false,
    });
  });

  test('paid access wins over an ended trial', async () => {
    const paid = service({
      trialEndsAt: new Date('2026-10-22T04:00:00Z'),
      paidUntil: new Date('2026-11-21T00:00:00Z'),
    });

    await expect(paid.snapshot('owner', now)).resolves.toMatchObject({
      state: 'paid',
      active: true,
    });
  });

  test('without enforcement nothing is restricted', async () => {
    const ended = service(
      { trialEndsAt: new Date('2026-10-22T04:00:00Z') },
      false,
    );

    await expect(ended.snapshot('owner', now)).resolves.toMatchObject({
      enforced: false,
      active: true,
    });
  });
});
