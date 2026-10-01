import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { validateEnvironment } from '../app.module';
import {
  CONVERSATION_REPOSITORY,
  HINDSIGHT_REPOSITORY,
  USER_REPOSITORY,
} from '../database/interfaces';
import {
  PrismaConversationRepository,
  PrismaHindsightRepository,
  PrismaUserRepository,
} from '../database/repositories';
import { PrismaModule } from '../infra/prisma';
import { QueueModule } from '../infra/queue';
import { ModelGatewayModule } from '../infra/model-gateway';
import { ObservabilityModule } from '../infra/observability';
import { MemoryEligibilityReplayService } from '../modules/memories/memory-eligibility-replay.service';
import { MemoryEngineService } from '../modules/memories/memory-engine.service';
import { MemoryPolicyService } from '../modules/memories/memory-policy.service';

// Deliberately omit the application module's schedulers, workers and channel
// runtimes. Replay only touches the explicitly selected owner's source IDs.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    PrismaModule,
    QueueModule,
    ModelGatewayModule,
    ObservabilityModule,
  ],
  providers: [
    {
      provide: CONVERSATION_REPOSITORY,
      useClass: PrismaConversationRepository,
    },
    { provide: HINDSIGHT_REPOSITORY, useClass: PrismaHindsightRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    MemoryEligibilityReplayService,
    MemoryEngineService,
    MemoryPolicyService,
  ],
})
export class EligibilityReplayOperationModule {}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const values = args.filter((value) => value !== '--apply');
  const [userId, ...messageIds] = values;
  if (
    !userId ||
    messageIds.length < 1 ||
    messageIds.length > 24 ||
    new Set(messageIds).size !== messageIds.length ||
    values.some((value) => value.startsWith('--'))
  )
    throw new Error('InvalidArguments');
  const app = await NestFactory.createApplicationContext(
    EligibilityReplayOperationModule,
    { logger: false, abortOnError: false },
  );

  try {
    const rows = await app
      .get(MemoryEligibilityReplayService)
      .replay(userId, messageIds, apply);

    process.stdout.write(`${JSON.stringify({ apply, rows })}\n`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  // Avoid printing provider errors, connection strings or source contents.
  const category = error instanceof Error ? error.name : 'UnknownError';
  process.stderr.write(`Eligibility replay failed (${category}).\n`);
  process.stderr.write(
    'Usage: memory-eligibility-replay <user-id> <message-id> [message-id ...] [--apply]\n',
  );
  process.exitCode = 1;
});
