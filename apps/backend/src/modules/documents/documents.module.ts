import { Module } from '@nestjs/common';
import { PrismaDocumentRepository } from '../../database/repositories';
import { DOCUMENT_REPOSITORY } from '../../database/interfaces';
import { EmbeddingsModule } from '../../infra/embeddings';
import { ModelGatewayModule } from '../../infra/model-gateway';
import { DocumentParserModule } from '../../infra/document-parser';
import { DocumentExtractionService } from './document-extraction.service';
import { DocumentsController } from './documents.controller';
import { DocumentService } from './document.service';
import { DocumentReprocessingService } from './document-reprocessing.service';
import { DocumentUploadInterceptor } from './document-upload.interceptor';
import { DocumentArtifactCleanupModule } from '../document-artifacts/document-artifact-cleanup.module';

@Module({
  imports: [
    EmbeddingsModule,
    ModelGatewayModule,
    DocumentParserModule,
    DocumentArtifactCleanupModule,
  ],
  controllers: [DocumentsController],
  providers: [
    { provide: DOCUMENT_REPOSITORY, useClass: PrismaDocumentRepository },
    DocumentService,
    DocumentUploadInterceptor,
    DocumentExtractionService,
    DocumentReprocessingService,
  ],
  exports: [DOCUMENT_REPOSITORY, DocumentService, DocumentReprocessingService],
})
export class DocumentsModule {}
