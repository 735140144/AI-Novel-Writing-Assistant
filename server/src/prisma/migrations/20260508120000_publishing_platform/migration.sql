CREATE TYPE "PublishingPlatform" AS ENUM ('fanqie');
CREATE TYPE "PublishingCredentialStatus" AS ENUM ('created', 'login_pending', 'ready', 'expired', 'invalid');
CREATE TYPE "NovelPlatformBindingStatus" AS ENUM ('active', 'needs_validation', 'disabled');
CREATE TYPE "PublishMode" AS ENUM ('draft', 'publish');
CREATE TYPE "PublishPlanStatus" AS ENUM ('draft', 'ready', 'submitting', 'completed', 'failed');
CREATE TYPE "PublishItemStatus" AS ENUM ('unpublished', 'submitting', 'draft_box', 'published', 'failed', 'relogin_required');
CREATE TYPE "PublishDispatchJobStatus" AS ENUM ('queued', 'leased', 'running', 'completed', 'failed');

CREATE TABLE "PublishingPlatformCredential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" "PublishingPlatform" NOT NULL DEFAULT 'fanqie',
  "label" TEXT NOT NULL,
  "credentialUuid" TEXT NOT NULL,
  "status" "PublishingCredentialStatus" NOT NULL DEFAULT 'created',
  "accountId" TEXT,
  "accountDisplayName" TEXT,
  "lastValidatedAt" TIMESTAMP(3),
  "lastLoginChallengeId" TEXT,
  "lastLoginChallengeStatus" TEXT,
  "lastLoginChallengeJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishingPlatformCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NovelPlatformBinding" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "platform" "PublishingPlatform" NOT NULL DEFAULT 'fanqie',
  "bookId" TEXT NOT NULL,
  "bookTitle" TEXT NOT NULL,
  "status" "NovelPlatformBindingStatus" NOT NULL DEFAULT 'active',
  "lastValidatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NovelPlatformBinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublishPlan" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "bindingId" TEXT NOT NULL,
  "platform" "PublishingPlatform" NOT NULL DEFAULT 'fanqie',
  "mode" "PublishMode" NOT NULL DEFAULT 'draft',
  "instruction" TEXT NOT NULL,
  "structuredScheduleJson" TEXT NOT NULL,
  "resolvedScheduleJson" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  "startChapterOrder" INTEGER,
  "endChapterOrder" INTEGER,
  "chaptersPerDay" INTEGER NOT NULL,
  "publishTimeOfDay" TEXT NOT NULL,
  "status" "PublishPlanStatus" NOT NULL DEFAULT 'ready',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublishDispatchJob" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "bindingId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "planId" TEXT,
  "requestId" TEXT NOT NULL,
  "externalJobId" TEXT,
  "platform" "PublishingPlatform" NOT NULL DEFAULT 'fanqie',
  "mode" "PublishMode" NOT NULL,
  "plannedPublishTime" TEXT NOT NULL,
  "status" "PublishDispatchJobStatus" NOT NULL DEFAULT 'queued',
  "credentialUuid" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "bookTitle" TEXT NOT NULL,
  "chapterCount" INTEGER NOT NULL,
  "payloadSummaryJson" TEXT,
  "resultJson" TEXT,
  "lastError" TEXT,
  "submittedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishDispatchJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublishPlanItem" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "bindingId" TEXT NOT NULL,
  "chapterId" TEXT NOT NULL,
  "chapterOrder" INTEGER NOT NULL,
  "chapterTitle" TEXT NOT NULL,
  "volumeTitle" TEXT,
  "plannedPublishTime" TEXT NOT NULL,
  "status" "PublishItemStatus" NOT NULL DEFAULT 'unpublished',
  "dispatchJobId" TEXT,
  "externalJobId" TEXT,
  "dispatchStatus" "PublishDispatchJobStatus",
  "submittedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishPlanItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublishingPlatformCredential_platform_credentialUuid_key"
ON "PublishingPlatformCredential"("platform", "credentialUuid");

CREATE UNIQUE INDEX "PublishingPlatformCredential_userId_platform_credentialUuid_key"
ON "PublishingPlatformCredential"("userId", "platform", "credentialUuid");

CREATE INDEX "PublishingPlatformCredential_userId_platform_status_idx"
ON "PublishingPlatformCredential"("userId", "platform", "status");

CREATE UNIQUE INDEX "NovelPlatformBinding_novelId_platform_key"
ON "NovelPlatformBinding"("novelId", "platform");

CREATE INDEX "NovelPlatformBinding_credentialId_idx"
ON "NovelPlatformBinding"("credentialId");

CREATE INDEX "NovelPlatformBinding_novelId_platform_status_idx"
ON "NovelPlatformBinding"("novelId", "platform", "status");

CREATE INDEX "PublishPlan_novelId_status_createdAt_idx"
ON "PublishPlan"("novelId", "status", "createdAt");

CREATE INDEX "PublishPlan_bindingId_status_createdAt_idx"
ON "PublishPlan"("bindingId", "status", "createdAt");

CREATE UNIQUE INDEX "PublishDispatchJob_requestId_key"
ON "PublishDispatchJob"("requestId");

CREATE INDEX "PublishDispatchJob_novelId_createdAt_idx"
ON "PublishDispatchJob"("novelId", "createdAt");

CREATE INDEX "PublishDispatchJob_bindingId_plannedPublishTime_idx"
ON "PublishDispatchJob"("bindingId", "plannedPublishTime");

CREATE INDEX "PublishDispatchJob_credentialId_idx"
ON "PublishDispatchJob"("credentialId");

CREATE INDEX "PublishDispatchJob_externalJobId_idx"
ON "PublishDispatchJob"("externalJobId");

CREATE UNIQUE INDEX "PublishPlanItem_planId_chapterId_key"
ON "PublishPlanItem"("planId", "chapterId");

CREATE INDEX "PublishPlanItem_novelId_status_plannedPublishTime_idx"
ON "PublishPlanItem"("novelId", "status", "plannedPublishTime");

CREATE INDEX "PublishPlanItem_bindingId_plannedPublishTime_idx"
ON "PublishPlanItem"("bindingId", "plannedPublishTime");

CREATE INDEX "PublishPlanItem_chapterId_idx"
ON "PublishPlanItem"("chapterId");

CREATE INDEX "PublishPlanItem_dispatchJobId_idx"
ON "PublishPlanItem"("dispatchJobId");

ALTER TABLE "PublishingPlatformCredential"
ADD CONSTRAINT "PublishingPlatformCredential_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NovelPlatformBinding"
ADD CONSTRAINT "NovelPlatformBinding_novelId_fkey"
FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NovelPlatformBinding"
ADD CONSTRAINT "NovelPlatformBinding_credentialId_fkey"
FOREIGN KEY ("credentialId") REFERENCES "PublishingPlatformCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublishPlan"
ADD CONSTRAINT "PublishPlan_novelId_fkey"
FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublishPlan"
ADD CONSTRAINT "PublishPlan_bindingId_fkey"
FOREIGN KEY ("bindingId") REFERENCES "NovelPlatformBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublishDispatchJob"
ADD CONSTRAINT "PublishDispatchJob_novelId_fkey"
FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublishDispatchJob"
ADD CONSTRAINT "PublishDispatchJob_bindingId_fkey"
FOREIGN KEY ("bindingId") REFERENCES "NovelPlatformBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublishDispatchJob"
ADD CONSTRAINT "PublishDispatchJob_credentialId_fkey"
FOREIGN KEY ("credentialId") REFERENCES "PublishingPlatformCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublishDispatchJob"
ADD CONSTRAINT "PublishDispatchJob_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "PublishPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PublishPlanItem"
ADD CONSTRAINT "PublishPlanItem_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "PublishPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublishPlanItem"
ADD CONSTRAINT "PublishPlanItem_novelId_fkey"
FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublishPlanItem"
ADD CONSTRAINT "PublishPlanItem_bindingId_fkey"
FOREIGN KEY ("bindingId") REFERENCES "NovelPlatformBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublishPlanItem"
ADD CONSTRAINT "PublishPlanItem_chapterId_fkey"
FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublishPlanItem"
ADD CONSTRAINT "PublishPlanItem_dispatchJobId_fkey"
FOREIGN KEY ("dispatchJobId") REFERENCES "PublishDispatchJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
