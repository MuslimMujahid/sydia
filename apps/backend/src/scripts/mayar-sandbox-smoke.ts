import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { MayarGateway } from '../infra/mayar/mayar.gateway';

async function main() {
  if (process.env.MAYAR_ENVIRONMENT !== 'sandbox')
    throw new Error(
      'Explicit MAYAR_ENVIRONMENT=sandbox is required; this script never tests production',
    );
  const gateway = new MayarGateway(new ConfigService());

  try {
    const orderId = `sandbox-contract-${randomUUID()}`;
    const invoice = await gateway.createInvoice({
      orderId,
      name: 'Sydia sandbox contract',
      email: 'billing-contract@example.test',
      mobile: '+12025550123',
      amount: 29_000,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });

    const result = await gateway.inspectInvoice(
      invoice.id,
      invoice.transactionId,
    );

    if (
      result.orderReference !== orderId ||
      result.amount !== 29_000 ||
      result.invoiceAmount !== 29_000 ||
      result.invoiceId !== invoice.id ||
      result.transactionId !== invoice.transactionId ||
      result.paymentLinkId !== invoice.id ||
      result.merchantId !== result.transactionMerchantId
    )
      throw new Error('Sandbox invoice and transaction correlation failed');
    Logger.log(
      JSON.stringify({
        environment: 'sandbox',
        invoiceId: invoice.id,
        transactionId: invoice.transactionId,
        merchantId: result.merchantId,
        invoiceStatus: result.invoiceStatus,
        transactionStatus: result.status,
        expiresAt: invoice.expiresAt.toISOString(),
        correlationVerified: true,
      }),
      'MayarSandbox',
    );
  } finally {
    gateway.onModuleDestroy();
  }
}

void main().catch((error: unknown) => {
  Logger.error(
    'Mayar sandbox contract failed',
    error instanceof Error ? error.message : 'Unknown failure',
    'MayarSandbox',
  );
  process.exitCode = 1;
});
