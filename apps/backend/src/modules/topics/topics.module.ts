import { Module } from '@nestjs/common';
import { TOPIC_REPOSITORY, USER_REPOSITORY } from '../../database/interfaces';
import {
  PrismaTopicRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import { DecisionGatewayModule } from '../../infra/decision-gateway';
import { EmbeddingsModule } from '../../infra/embeddings';
import { ModelGatewayModule } from '../../infra/model-gateway';
import { TopicFormationService } from './topic-formation.service';
import { TopicRecognitionService } from './topic-recognition.service';
import { TopicSchedulerService } from './topic-scheduler.service';

/** Implicit topics per user (docs/TOPIC_CONTEXT_SPEC.md). */
@Module({
  imports: [DecisionGatewayModule, EmbeddingsModule, ModelGatewayModule],
  providers: [
    { provide: TOPIC_REPOSITORY, useClass: PrismaTopicRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    TopicRecognitionService,
    TopicFormationService,
    TopicSchedulerService,
  ],
  exports: [TopicFormationService, TopicSchedulerService],
})
export class TopicsModule {}
