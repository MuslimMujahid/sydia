import 'dotenv/config';
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
    const memberId = await gateway.ensureMember({
      name: 'Sydia sandbox contract',
      email: 'billing-contract@example.test',
      mobile: '+12025550123',
    });

    const invoice = await gateway.createInvoice({ memberId });
    const result = await gateway.inspectPayment(invoice.id);

    if (
      result.invoiceId !== invoice.id ||
      result.amount !== invoice.amount ||
      result.merchantId.length === 0
    )
      throw new Error('Sandbox membership invoice mismatch');
    Logger.log(
      JSON.stringify({
        environment: 'sandbox',
        memberId,
        invoiceId: invoice.id,
        transactionId: invoice.transactionId,
        paidTransaction: result.transaction?.id ?? null,
        merchantId: result.merchantId,
        amount: invoice.amount,
        invoiceStatus: result.invoiceStatus,
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
