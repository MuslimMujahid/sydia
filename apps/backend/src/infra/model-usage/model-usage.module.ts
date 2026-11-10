import { Global, Module } from '@nestjs/common';
import { MODEL_USAGE_REPOSITORY } from '../../database/interfaces';
import { PrismaModelUsageRepository } from '../../database/repositories';
import { PrismaModule } from '../prisma';
import { HindsightUsageService } from './hindsight-usage.service';
import { ModelUsageRecorder } from './model-usage.recorder';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    { provide: MODEL_USAGE_REPOSITORY, useClass: PrismaModelUsageRepository },
    ModelUsageRecorder,
    HindsightUsageService,
  ],
  exports: [ModelUsageRecorder, HindsightUsageService],
})
export class ModelUsageModule {}
