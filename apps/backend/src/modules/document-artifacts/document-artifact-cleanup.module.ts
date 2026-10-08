import { Module } from '@nestjs/common';
import { PrismaDocumentArtifactCleanupRepository } from '../../database/repositories';
import { DOCUMENT_ARTIFACT_CLEANUP_REPOSITORY } from '../../database/interfaces';
import { DocumentArtifactCleanupService } from './document-artifact-cleanup.service';

@Module({
  providers: [
    {
      provide: DOCUMENT_ARTIFACT_CLEANUP_REPOSITORY,
      useClass: PrismaDocumentArtifactCleanupRepository,
    },
    DocumentArtifactCleanupService,
  ],
  exports: [
    DOCUMENT_ARTIFACT_CLEANUP_REPOSITORY,
    DocumentArtifactCleanupService,
  ],
})
export class DocumentArtifactCleanupModule {}
