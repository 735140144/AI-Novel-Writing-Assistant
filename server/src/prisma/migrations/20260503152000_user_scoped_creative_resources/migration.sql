ALTER TABLE "NovelGenre" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "NovelStoryMode" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "TitleLibrary" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "BaseCharacter" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "ImageGenerationTask" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "StyleProfile" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "StyleExtractionTask" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "StyleExtractionTask" ADD COLUMN IF NOT EXISTS "sourceDocumentId" TEXT;
ALTER TABLE "StyleExtractionTask" ADD COLUMN IF NOT EXISTS "metadataJson" TEXT;
ALTER TABLE "WritingFormula" ADD COLUMN IF NOT EXISTS "userId" TEXT;

INSERT INTO "User" (
  "id",
  "email",
  "passwordHash",
  "role",
  "status",
  "emailVerifiedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'caoty-admin-user',
  'caoty@luckydcms.com',
  'sha256:120000:d9d83756ee73c879272a05f3c2e26bfd:874cc1cb578e38b9190204b1f05af1d53205e11de956c4532f598ab90b4d8ada',
  'admin',
  'active',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "User"
  WHERE "email" = 'caoty@luckydcms.com'
);

UPDATE "NovelGenre" SET "userId" = 'caoty-admin-user' WHERE "userId" IS NULL;
UPDATE "NovelStoryMode" SET "userId" = 'caoty-admin-user' WHERE "userId" IS NULL;
UPDATE "TitleLibrary" SET "userId" = 'caoty-admin-user' WHERE "userId" IS NULL;
UPDATE "BaseCharacter" SET "userId" = 'caoty-admin-user' WHERE "userId" IS NULL;
UPDATE "ImageGenerationTask" SET "userId" = 'caoty-admin-user' WHERE "userId" IS NULL;
UPDATE "StyleProfile" SET "userId" = 'caoty-admin-user' WHERE "userId" IS NULL;
UPDATE "StyleExtractionTask" SET "userId" = 'caoty-admin-user' WHERE "userId" IS NULL;
UPDATE "WritingFormula" SET "userId" = 'caoty-admin-user' WHERE "userId" IS NULL;

CREATE INDEX IF NOT EXISTS "NovelGenre_userId_idx" ON "NovelGenre"("userId");
CREATE INDEX IF NOT EXISTS "NovelStoryMode_userId_idx" ON "NovelStoryMode"("userId");
CREATE INDEX IF NOT EXISTS "TitleLibrary_userId_idx" ON "TitleLibrary"("userId");
CREATE INDEX IF NOT EXISTS "TitleLibrary_genreId_idx" ON "TitleLibrary"("genreId");
CREATE INDEX IF NOT EXISTS "BaseCharacter_userId_idx" ON "BaseCharacter"("userId");
CREATE INDEX IF NOT EXISTS "ImageGenerationTask_userId_idx" ON "ImageGenerationTask"("userId");
CREATE INDEX IF NOT EXISTS "StyleProfile_userId_idx" ON "StyleProfile"("userId");
CREATE INDEX IF NOT EXISTS "StyleExtractionTask_userId_idx" ON "StyleExtractionTask"("userId");
CREATE INDEX IF NOT EXISTS "StyleExtractionTask_sourceDocumentId_idx" ON "StyleExtractionTask"("sourceDocumentId");
CREATE INDEX IF NOT EXISTS "WritingFormula_userId_idx" ON "WritingFormula"("userId");

DO $$ BEGIN
  ALTER TABLE "NovelGenre" ADD CONSTRAINT "NovelGenre_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "NovelStoryMode" ADD CONSTRAINT "NovelStoryMode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TitleLibrary" ADD CONSTRAINT "TitleLibrary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BaseCharacter" ADD CONSTRAINT "BaseCharacter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ImageGenerationTask" ADD CONSTRAINT "ImageGenerationTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StyleProfile" ADD CONSTRAINT "StyleProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StyleExtractionTask" ADD CONSTRAINT "StyleExtractionTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "WritingFormula" ADD CONSTRAINT "WritingFormula_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TitleLibrary" ADD CONSTRAINT "TitleLibrary_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "NovelGenre"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
