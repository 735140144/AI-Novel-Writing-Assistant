ALTER TABLE "Novel" ADD COLUMN IF NOT EXISTS "userId" TEXT;

UPDATE "Novel"
SET "userId" = 'caoty-admin-user'
WHERE "userId" IS NULL;

CREATE INDEX IF NOT EXISTS "Novel_userId_idx" ON "Novel"("userId");

DO $$ BEGIN
  ALTER TABLE "Novel" ADD CONSTRAINT "Novel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
