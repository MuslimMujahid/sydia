import { Module } from '@nestjs/common';
import { MEMORY_REPOSITORY, USER_REPOSITORY } from '../../database/interfaces';
import {
  PrismaMemoryRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { EmbeddingsModule } from '../../infra/embeddings';
import { ModelGatewayModule } from '../../infra/model-gateway';
import { MemoriesController } from './memories.controller';
import { MemoryService } from './memory.service';
import { AutomaticMemoryExtractorService } from './automatic-memory-extractor.service';

@Module({
  imports: [EmbeddingsModule, ModelGatewayModule],
  controllers: [MemoriesController],
  providers: [
    { provide: MEMORY_REPOSITORY, useClass: PrismaMemoryRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    AutomaticMemoryExtractorService,
    MemoryService,
  ],
  exports: [MEMORY_REPOSITORY, MemoryService, AutomaticMemoryExtractorService],
})
export class MemoriesModule {}
