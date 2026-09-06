CREATE TABLE "file_asset" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "file_asset_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "document" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "fileAssetId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processing', "title" TEXT NOT NULL,
  "textContent" TEXT, "transcript" TEXT, "imageDescription" TEXT,
  "structuredData" JSONB, "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "document_chunk" (
  "id" TEXT NOT NULL, "documentId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL, "pageNumber" INTEGER, "content" TEXT NOT NULL,
  "embedding" vector(1536), "embeddingModel" TEXT, "embeddingVersion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_chunk_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "message_attachment" (
  "messageId" TEXT NOT NULL, "fileAssetId" TEXT NOT NULL,
  CONSTRAINT "message_attachment_pkey" PRIMARY KEY ("messageId", "fileAssetId")
);
CREATE TABLE "contact" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL, "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "email" TEXT, "phone" TEXT, "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "calendar_integration" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "provider" TEXT NOT NULL DEFAULT 'google',
  "status" TEXT NOT NULL DEFAULT 'disconnected', "accessToken" TEXT, "refreshToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3), "scope" TEXT, "calendarId" TEXT DEFAULT 'primary',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_integration_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "calendar_event" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "provider" TEXT NOT NULL DEFAULT 'local',
  "providerEventId" TEXT, "title" TEXT NOT NULL, "description" TEXT, "location" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL, "endAt" TIMESTAMP(3) NOT NULL, "timezone" TEXT NOT NULL,
  "attendees" TEXT[] DEFAULT ARRAY[]::TEXT[], "status" TEXT NOT NULL DEFAULT 'confirmed',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_event_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "file_asset_storageKey_key" ON "file_asset"("storageKey");
CREATE INDEX "file_asset_userId_createdAt_idx" ON "file_asset"("userId", "createdAt");
CREATE UNIQUE INDEX "document_fileAssetId_key" ON "document"("fileAssetId");
CREATE INDEX "document_userId_createdAt_idx" ON "document"("userId", "createdAt");
CREATE INDEX "document_userId_status_idx" ON "document"("userId", "status");
CREATE UNIQUE INDEX "document_chunk_documentId_chunkIndex_key" ON "document_chunk"("documentId", "chunkIndex");
CREATE INDEX "document_chunk_userId_documentId_idx" ON "document_chunk"("userId", "documentId");
CREATE INDEX "contact_userId_normalizedName_idx" ON "contact"("userId", "normalizedName");
CREATE INDEX "contact_userId_updatedAt_idx" ON "contact"("userId", "updatedAt");
CREATE UNIQUE INDEX "calendar_integration_userId_provider_key" ON "calendar_integration"("userId", "provider");
CREATE UNIQUE INDEX "calendar_event_userId_provider_providerEventId_key" ON "calendar_event"("userId", "provider", "providerEventId");
CREATE INDEX "calendar_event_userId_startAt_status_idx" ON "calendar_event"("userId", "startAt", "status");
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document" ADD CONSTRAINT "document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document" ADD CONSTRAINT "document_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "file_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_attachment" ADD CONSTRAINT "message_attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_attachment" ADD CONSTRAINT "message_attachment_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "file_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact" ADD CONSTRAINT "contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_integration" ADD CONSTRAINT "calendar_integration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
