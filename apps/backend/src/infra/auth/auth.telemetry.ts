import { metrics } from '@opentelemetry/api';

const events = metrics
  .getMeter('sydia.auth')
  .createCounter('sydia.auth.events', {
    description:
      'Identity lifecycle events. account.created is the registration funnel entry; it never carries email or name.',
  });

export function recordAuthEvent(event: 'account.created') {
  events.add(1, { event });
}
