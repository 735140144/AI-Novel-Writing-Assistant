DROP INDEX IF EXISTS "NovelPlatformBinding_novelId_platform_key";

ALTER TABLE "NovelPlatformBinding"
ADD COLUMN "remoteProgressSnapshotJson" TEXT;

CREATE UNIQUE INDEX "NovelPlatformBinding_novelId_credentialId_platform_key"
ON "NovelPlatformBinding"("novelId", "credentialId", "platform");
