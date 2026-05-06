CREATE TABLE IF NOT EXISTS "UserSetting" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserSetting_userId_key_key" ON "UserSetting"("userId", "key");
CREATE INDEX IF NOT EXISTS "UserSetting_userId_idx" ON "UserSetting"("userId");

DO $$ BEGIN
  ALTER TABLE "UserSetting" ADD CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AppSetting" ADD COLUMN IF NOT EXISTS "category" TEXT;

UPDATE "AppSetting"
SET "category" = 'system_email'
WHERE "key" LIKE 'systemEmail.%';
