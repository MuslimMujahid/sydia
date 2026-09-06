ALTER TABLE "task" DROP COLUMN "tags";

CREATE TABLE "category" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "iconKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_category" (
  "taskId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  CONSTRAINT "task_category_pkey" PRIMARY KEY ("taskId", "categoryId")
);

CREATE UNIQUE INDEX "category_userId_normalizedName_key" ON "category"("userId", "normalizedName");
CREATE INDEX "category_userId_name_idx" ON "category"("userId", "name");
CREATE INDEX "task_category_categoryId_idx" ON "task_category"("categoryId");
ALTER TABLE "category" ADD CONSTRAINT "category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_category" ADD CONSTRAINT "task_category_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_category" ADD CONSTRAINT "task_category_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "category" ("id", "userId", "name", "normalizedName", "color", "iconKey")
SELECT CONCAT("id", '-category-', defaults.slug), "id", defaults.name, defaults.normalized, defaults.color, defaults.icon
FROM "user"
CROSS JOIN (VALUES
  ('kerja', 'Kerja', 'kerja', 'blue', 'briefcase'),
  ('pribadi', 'Pribadi', 'pribadi', 'violet', 'heart'),
  ('keuangan', 'Keuangan', 'keuangan', 'emerald', 'wallet'),
  ('belajar', 'Belajar', 'belajar', 'amber', 'book'),
  ('kesehatan', 'Kesehatan', 'kesehatan', 'rose', 'health'),
  ('keluarga', 'Keluarga', 'keluarga', 'cyan', 'family'),
  ('belanja', 'Belanja', 'belanja', 'orange', 'shopping')
) AS defaults(slug, name, normalized, color, icon);
