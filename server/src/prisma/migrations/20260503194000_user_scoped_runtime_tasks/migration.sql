ALTER TABLE "GenerationJob" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "CreativeHubThread" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "NovelWorkflowTask" ADD COLUMN IF NOT EXISTS "userId" TEXT;

UPDATE "GenerationJob"
SET "userId" = "Novel"."userId"
FROM "Novel"
WHERE "GenerationJob"."novelId" = "Novel"."id"
  AND "GenerationJob"."userId" IS NULL
  AND "Novel"."userId" IS NOT NULL;

UPDATE "AgentRun"
SET "userId" = "Novel"."userId"
FROM "Novel"
WHERE "AgentRun"."novelId" = "Novel"."id"
  AND "AgentRun"."userId" IS NULL
  AND "Novel"."userId" IS NOT NULL;

UPDATE "NovelWorkflowTask"
SET "userId" = "Novel"."userId"
FROM "Novel"
WHERE "NovelWorkflowTask"."novelId" = "Novel"."id"
  AND "NovelWorkflowTask"."userId" IS NULL
  AND "Novel"."userId" IS NOT NULL;

WITH admin_user AS (
  SELECT "id"
  FROM "User"
  WHERE "email" = 'caoty@luckydcms.com'
  LIMIT 1
)
UPDATE "GenerationJob"
SET "userId" = admin_user."id"
FROM admin_user
WHERE "GenerationJob"."userId" IS NULL;

WITH admin_user AS (
  SELECT "id"
  FROM "User"
  WHERE "email" = 'caoty@luckydcms.com'
  LIMIT 1
)
UPDATE "AgentRun"
SET "userId" = admin_user."id"
FROM admin_user
WHERE "AgentRun"."userId" IS NULL;

WITH admin_user AS (
  SELECT "id"
  FROM "User"
  WHERE "email" = 'caoty@luckydcms.com'
  LIMIT 1
)
UPDATE "CreativeHubThread"
SET "userId" = admin_user."id"
FROM admin_user
WHERE "CreativeHubThread"."userId" IS NULL;

WITH admin_user AS (
  SELECT "id"
  FROM "User"
  WHERE "email" = 'caoty@luckydcms.com'
  LIMIT 1
)
UPDATE "NovelWorkflowTask"
SET "userId" = admin_user."id"
FROM admin_user
WHERE "NovelWorkflowTask"."userId" IS NULL;

CREATE INDEX IF NOT EXISTS "GenerationJob_userId_idx" ON "GenerationJob"("userId");
CREATE INDEX IF NOT EXISTS "AgentRun_userId_idx" ON "AgentRun"("userId");
CREATE INDEX IF NOT EXISTS "CreativeHubThread_userId_idx" ON "CreativeHubThread"("userId");
CREATE INDEX IF NOT EXISTS "NovelWorkflowTask_userId_idx" ON "NovelWorkflowTask"("userId");

DO $$ BEGIN
  ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CreativeHubThread" ADD CONSTRAINT "CreativeHubThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "NovelWorkflowTask" ADD CONSTRAINT "NovelWorkflowTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
