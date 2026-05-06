ALTER TABLE "KnowledgeDocument" ADD COLUMN "userId" TEXT;

CREATE INDEX IF NOT EXISTS "KnowledgeDocument_userId_idx" ON "KnowledgeDocument"("userId");
