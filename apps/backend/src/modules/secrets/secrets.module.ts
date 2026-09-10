import { Module } from '@nestjs/common';
import {
  CONVERSATION_REPOSITORY,
  SECRET_REPOSITORY,
} from '../../database/interfaces';
import {
  PrismaConversationRepository,
  PrismaSecretRepository,
} from '../../database/repositories';
import { AuditModule } from '../../database/audit.module';
import {
  SecretRevealsController,
  SecretsController,
} from './secrets.controller';
import { SecretsService } from './secrets.service';

@Module({
  imports: [AuditModule],
  controllers: [SecretsController, SecretRevealsController],
  providers: [
    { provide: SECRET_REPOSITORY, useClass: PrismaSecretRepository },
    {
      provide: CONVERSATION_REPOSITORY,
      useClass: PrismaConversationRepository,
    },
    SecretsService,
  ],
  exports: [SECRET_REPOSITORY, SecretsService],
})
export class SecretsModule {}
