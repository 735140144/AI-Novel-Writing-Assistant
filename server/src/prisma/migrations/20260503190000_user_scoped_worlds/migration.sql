ALTER TABLE "World" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "WorldPropertyLibrary" ADD COLUMN IF NOT EXISTS "userId" TEXT;

UPDATE "World"
SET "userId" = 'caoty-admin-user'
WHERE "userId" IS NULL;

UPDATE "WorldPropertyLibrary"
SET "userId" = 'caoty-admin-user'
WHERE "userId" IS NULL;

CREATE INDEX IF NOT EXISTS "World_userId_idx" ON "World"("userId");
CREATE INDEX IF NOT EXISTS "WorldPropertyLibrary_userId_idx" ON "WorldPropertyLibrary"("userId");

DO $$ BEGIN
  ALTER TABLE "World" ADD CONSTRAINT "World_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "WorldPropertyLibrary" ADD CONSTRAINT "WorldPropertyLibrary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
