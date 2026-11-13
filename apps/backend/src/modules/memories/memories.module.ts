import { Module } from '@nestjs/common';
import {
  CONVERSATION_REPOSITORY,
  HINDSIGHT_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaConversationRepository,
  PrismaHindsightRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { HindsightModule } from '../../infra/hindsight';
import { ModelGatewayModule } from '../../infra/model-gateway';
import { HindsightDeliveryService } from './hindsight-delivery.service';
import { MemoryEngineService } from './memory-engine.service';
import { MemoryAccessService } from './memory-access.service';
import { MemoryPolicyService } from './memory-policy.service';
import { HindsightIngestionService } from './hindsight-ingestion.service';
import { MemoryArchiveService } from './memory-archive.service';
import { DecisionGatewayModule } from '../../infra/decision-gateway';
import { MemoryEligibilityService } from './memory-eligibility.service';
import { MemoryFactDecisionService } from './memory-fact-decision.service';
import { MemoryEligibilityReplayService } from './memory-eligibility-replay.service';

@Module({
  imports: [ModelGatewayModule, HindsightModule, DecisionGatewayModule],
  providers: [
    { provide: HINDSIGHT_REPOSITORY, useClass: PrismaHindsightRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    {
      provide: CONVERSATION_REPOSITORY,
      useClass: PrismaConversationRepository,
    },
    HindsightDeliveryService,
    MemoryEngineService,
    MemoryAccessService,
    MemoryPolicyService,
    MemoryEligibilityService,
    MemoryEligibilityReplayService,
    MemoryFactDecisionService,
    HindsightIngestionService,
    MemoryArchiveService,
  ],
  exports: [
    HindsightIngestionService,
    MemoryEligibilityReplayService,
    HindsightDeliveryService,
    MemoryEngineService,
    MemoryAccessService,
    MemoryArchiveService,
  ],
})
export class MemoriesModule {}
