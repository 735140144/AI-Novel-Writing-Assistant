ALTER TABLE "BookAnalysis" ADD COLUMN IF NOT EXISTS "userId" TEXT;

UPDATE "BookAnalysis"
SET "userId" = "KnowledgeDocument"."userId"
FROM "KnowledgeDocument"
WHERE "BookAnalysis"."documentId" = "KnowledgeDocument"."id"
  AND "BookAnalysis"."userId" IS NULL;

UPDATE "BookAnalysis"
SET "userId" = 'caoty-admin-user'
WHERE "userId" IS NULL;

CREATE INDEX IF NOT EXISTS "BookAnalysis_userId_idx" ON "BookAnalysis"("userId");
CREATE INDEX IF NOT EXISTS "BookAnalysis_userId_status_idx" ON "BookAnalysis"("userId", "status");

DO $$ BEGIN
  ALTER TABLE "BookAnalysis" ADD CONSTRAINT "BookAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
