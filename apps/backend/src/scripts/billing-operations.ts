import '../worker-runtime';
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BillingService, BillingOperationsService } from '../modules/billing';

async function main() {
  const context = await NestFactory.createApplicationContext(AppModule);

  try {
    const billing = context.get(BillingService);
    const operations = context.get(BillingOperationsService);
    const [command, ...args] = process.argv.slice(2);
    if (command === 'rollout')
      Logger.log(
        `Initialized ${await billing.initializeTrials()} billing accounts; existing trials were preserved.`,
        'BillingOperations',
      );
    else if (command === 'recover') await billing.recover();
    else if (command === 'reviews')
      Logger.log(
        JSON.stringify(await operations.reviews()),
        'BillingOperations',
      );
    else if (command === 'link-invoice' && args.length === 4)
      await operations.linkInvoice(args[0]!, args[1]!, args[2]!, args[3]!);
    else if (command === 'close-unpaid' && args.length === 3)
      await operations.closeUnpaid(args[0]!, args[1]!, args[2]!);
    else
      throw new Error(
        'Usage: billing:ops rollout|recover|reviews|link-invoice ORDER INVOICE TRANSACTION ADMIN_USER|close-unpaid ORDER ADMIN_USER "dashboard evidence"',
      );
  } finally {
    await context.close();
  }
}

void main().catch((error: unknown) => {
  Logger.error(
    'Billing operation failed',
    error instanceof Error ? error.stack : undefined,
    'BillingOperations',
  );
  process.exitCode = 1;
});
