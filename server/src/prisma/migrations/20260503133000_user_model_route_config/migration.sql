CREATE TABLE IF NOT EXISTS "UserModelRouteConfig" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "taskType" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  "maxTokens" INTEGER,
  "requestProtocol" TEXT NOT NULL DEFAULT 'auto',
  "structuredResponseFormat" TEXT NOT NULL DEFAULT 'auto',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserModelRouteConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserModelRouteConfig_userId_taskType_key" ON "UserModelRouteConfig"("userId", "taskType");
CREATE INDEX IF NOT EXISTS "UserModelRouteConfig_userId_idx" ON "UserModelRouteConfig"("userId");
CREATE INDEX IF NOT EXISTS "UserModelRouteConfig_provider_idx" ON "UserModelRouteConfig"("provider");

DO $$ BEGIN
  ALTER TABLE "UserModelRouteConfig" ADD CONSTRAINT "UserModelRouteConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
