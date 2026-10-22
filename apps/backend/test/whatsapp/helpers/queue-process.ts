import { ConfigService } from '@nestjs/config';
import { createInterface } from 'node:readline';
import { WhatsAppDeliveryQueues } from '../../../src/infra/queue/whatsapp-delivery-queues';

const url = process.env.WHATSAPP_TEST_REDIS_URL;
if (!url) throw new Error('Child Redis contract URL is missing.');
const queue = new WhatsAppDeliveryQueues(
  new ConfigService({ BACKEND_REDIS_URL: url }),
);

let release: (() => void) | undefined;
createInterface({ input: process.stdin }).on('line', (message) => {
  if (message === 'release') release?.();

  if (message === 'stop') {
    void queue
      .onModuleDestroy()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        console.error('Queue child shutdown failed.', error);
        process.exit(1);
      });
  }
});

async function main() {
  await queue.start(async (data) => {
    if (data.content !== 'child-blocked') {
      console.log(`delivered:${data.content}`);

      return;
    }

    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });

    console.log('entered');
    await blocked;
  });
  console.log('ready');
}

void main().catch((error: unknown) => {
  console.error('Queue child startup failed.', error);
  process.exit(1);
});
