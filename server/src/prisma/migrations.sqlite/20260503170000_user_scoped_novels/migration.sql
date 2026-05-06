ALTER TABLE "Novel" ADD COLUMN "userId" TEXT;

CREATE INDEX IF NOT EXISTS "Novel_userId_idx" ON "Novel"("userId");
