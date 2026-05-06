ALTER TABLE "World" ADD COLUMN "userId" TEXT;
ALTER TABLE "WorldPropertyLibrary" ADD COLUMN "userId" TEXT;

CREATE INDEX IF NOT EXISTS "World_userId_idx" ON "World"("userId");
CREATE INDEX IF NOT EXISTS "WorldPropertyLibrary_userId_idx" ON "WorldPropertyLibrary"("userId");
