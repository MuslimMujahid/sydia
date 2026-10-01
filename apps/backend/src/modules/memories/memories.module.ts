import { Module } from '@nestjs/common';
import {
  CONVERSATION_REPOSITORY,
  MEMORY_REPOSITORY,
  HINDSIGHT_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaConversationRepository,
  PrismaMemoryRepository,
  PrismaHindsightRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { EmbeddingsModule } from '../../infra/embeddings';
import { HindsightModule } from '../../infra/hindsight';
import { ModelGatewayModule } from '../../infra/model-gateway';
import { MemoriesController } from './memories.controller';
import { MemoryService } from './memory.service';
import { MemoryDreamService } from './memory-dream.service';
import { MemoryDreamSchedulerService } from './memory-dream-scheduler.service';
import { HindsightDeliveryService } from './hindsight-delivery.service';
import { MemoryEngineService } from './memory-engine.service';
import { MemoryAccessService } from './memory-access.service';
import { HindsightBackfillService } from './hindsight-backfill.service';
import { MemoryPolicyService } from './memory-policy.service';
import { HindsightIngestionService } from './hindsight-ingestion.service';
import { MemoryArchiveService } from './memory-archive.service';
import { MemoryRollbackService } from './memory-rollback.service';

@Module({
  imports: [EmbeddingsModule, ModelGatewayModule, HindsightModule],
  controllers: [MemoriesController],
  providers: [
    { provide: MEMORY_REPOSITORY, useClass: PrismaMemoryRepository },
    { provide: HINDSIGHT_REPOSITORY, useClass: PrismaHindsightRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    {
      provide: CONVERSATION_REPOSITORY,
      useClass: PrismaConversationRepository,
    },
    MemoryDreamService,
    MemoryDreamSchedulerService,
    MemoryService,
    HindsightDeliveryService,
    MemoryEngineService,
    MemoryAccessService,
    HindsightBackfillService,
    MemoryPolicyService,
    HindsightIngestionService,
    MemoryArchiveService,
    MemoryRollbackService,
  ],
  exports: [
    HindsightIngestionService,
    MEMORY_REPOSITORY,
    MemoryService,
    MemoryDreamService,
    MemoryDreamSchedulerService,
    HindsightDeliveryService,
    MemoryEngineService,
    MemoryAccessService,
    MemoryArchiveService,
  ],
})
export class MemoriesModule {}
