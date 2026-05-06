CREATE TABLE IF NOT EXISTS "UserSetting" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserSetting_userId_key_key" ON "UserSetting"("userId", "key");
CREATE INDEX IF NOT EXISTS "UserSetting_userId_idx" ON "UserSetting"("userId");
