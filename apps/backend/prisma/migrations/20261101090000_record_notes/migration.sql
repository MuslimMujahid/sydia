ALTER TABLE workspace_item ADD COLUMN format TEXT NOT NULL DEFAULT 'rich-text';
CREATE TABLE record_table (
 "noteId" TEXT PRIMARY KEY REFERENCES workspace_item(id) ON DELETE CASCADE,
 description TEXT NOT NULL DEFAULT '', columns JSONB NOT NULL, stats JSONB NOT NULL,
 "nextPosition" INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE record_row (
 id TEXT PRIMARY KEY, "noteId" TEXT NOT NULL REFERENCES record_table("noteId") ON DELETE CASCADE,
 position INTEGER NOT NULL, cells JSONB NOT NULL, sources JSONB NOT NULL
);
CREATE UNIQUE INDEX record_row_note_position ON record_row("noteId", position);
CREATE TABLE record_receipt (
 "userId" TEXT NOT NULL, key TEXT NOT NULL, fingerprint TEXT NOT NULL, result JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("userId", key)
);
