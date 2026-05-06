ALTER TABLE "BookAnalysis" ADD COLUMN "userId" TEXT;

UPDATE "BookAnalysis"
SET "userId" = (
  SELECT "KnowledgeDocument"."userId"
  FROM "KnowledgeDocument"
  WHERE "KnowledgeDocument"."id" = "BookAnalysis"."documentId"
)
WHERE "userId" IS NULL;

CREATE INDEX IF NOT EXISTS "BookAnalysis_userId_idx" ON "BookAnalysis"("userId");
CREATE INDEX IF NOT EXISTS "BookAnalysis_userId_status_idx" ON "BookAnalysis"("userId", "status");
