ALTER TABLE "KnowledgeDocument" ADD COLUMN IF NOT EXISTS "userId" TEXT;

UPDATE "KnowledgeDocument"
SET "userId" = 'caoty-admin-user'
WHERE "userId" IS NULL;

CREATE INDEX IF NOT EXISTS "KnowledgeDocument_userId_idx" ON "KnowledgeDocument"("userId");

DO $$ BEGIN
  ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
