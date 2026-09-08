import { Module } from '@nestjs/common';
import {
  CONVERSATION_REPOSITORY,
  MEMORY_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaConversationRepository,
  PrismaMemoryRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { EmbeddingsModule } from '../../infra/embeddings';
import { ModelGatewayModule } from '../../infra/model-gateway';
import { MemoriesController } from './memories.controller';
import { MemoryService } from './memory.service';
import { MemoryDreamService } from './memory-dream.service';
import { MemoryDreamSchedulerService } from './memory-dream-scheduler.service';

@Module({
  imports: [EmbeddingsModule, ModelGatewayModule],
  controllers: [MemoriesController],
  providers: [
    { provide: MEMORY_REPOSITORY, useClass: PrismaMemoryRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    {
      provide: CONVERSATION_REPOSITORY,
      useClass: PrismaConversationRepository,
    },
    MemoryDreamService,
    MemoryDreamSchedulerService,
    MemoryService,
  ],
  exports: [
    MEMORY_REPOSITORY,
    MemoryService,
    MemoryDreamService,
    MemoryDreamSchedulerService,
  ],
})
export class MemoriesModule {}
