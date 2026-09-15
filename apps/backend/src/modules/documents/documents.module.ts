import { Module } from '@nestjs/common';
import {
  PrismaDocumentRepository,
  PrismaUserRepository,
} from '../../database/repositories';
import {
  DOCUMENT_REPOSITORY,
  USER_REPOSITORY,
} from '../../database/interfaces';
import { EmbeddingsModule } from '../../infra/embeddings';
import { ModelGatewayModule } from '../../infra/model-gateway';
import { DocumentsController } from './documents.controller';
import { DocumentService } from './document.service';

@Module({
  imports: [EmbeddingsModule, ModelGatewayModule],
  controllers: [DocumentsController],
  providers: [
    { provide: DOCUMENT_REPOSITORY, useClass: PrismaDocumentRepository },
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    DocumentService,
  ],
  exports: [DOCUMENT_REPOSITORY, DocumentService],
})
export class DocumentsModule {}
