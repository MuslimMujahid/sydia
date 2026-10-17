import { Module } from '@nestjs/common';
import {
  PrismaDocumentRepository,
  PrismaFileLibraryRepository,
  PrismaFileDeletionRepository,
} from '../../database/repositories';
import {
  DOCUMENT_REPOSITORY,
  FILE_LIBRARY_REPOSITORY,
  FILE_DELETION_REPOSITORY,
} from '../../database/interfaces';
import { FileLibraryController } from './file-library.controller';
import { FileLibraryService } from './file-library.service';
import { FileDeletionController } from './file-deletion.controller';
import { FileDeletionWorker } from './file-deletion.worker';
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
  controllers: [
    DocumentsController,
    FileLibraryController,
    FileDeletionController,
  ],
  providers: [
    { provide: DOCUMENT_REPOSITORY, useClass: PrismaDocumentRepository },
    { provide: FILE_LIBRARY_REPOSITORY, useClass: PrismaFileLibraryRepository },
    FileLibraryService,
    {
      provide: FILE_DELETION_REPOSITORY,
      useClass: PrismaFileDeletionRepository,
    },
    FileDeletionWorker,
    DocumentService,
    DocumentUploadInterceptor,
    DocumentExtractionService,
    DocumentReprocessingService,
  ],
  exports: [DOCUMENT_REPOSITORY, DocumentService, DocumentReprocessingService],
})
export class DocumentsModule {}
