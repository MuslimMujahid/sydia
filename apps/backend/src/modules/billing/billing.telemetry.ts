import { metrics } from '@opentelemetry/api';

const events = metrics
  .getMeter('sydia.billing')
  .createCounter('sydia.billing.events', {
    description:
      'Billing state transitions and failures. Alert on review and recovery_failed.',
  });

export function recordBillingEvent(
  event:
    | 'payment_applied'
    | 'checkout_failed'
    | 'verification_mismatch'
    | 'recovery_failed'
    | 'access_denied'
    | 'storage_full'
    | 'order_review',
) {
  events.add(1, { event });
}
