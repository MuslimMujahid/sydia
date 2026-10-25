ALTER TABLE "message" ADD COLUMN "sourceSegments" JSONB, ADD COLUMN "sourceDocumentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
