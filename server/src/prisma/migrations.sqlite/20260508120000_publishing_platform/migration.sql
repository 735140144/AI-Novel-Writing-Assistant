CREATE TABLE "PublishingPlatformCredential" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'fanqie',
  "label" TEXT NOT NULL,
  "credentialUuid" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'created',
  "accountId" TEXT,
  "accountDisplayName" TEXT,
  "lastValidatedAt" DATETIME,
  "lastLoginChallengeId" TEXT,
  "lastLoginChallengeStatus" TEXT,
  "lastLoginChallengeJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PublishingPlatformCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "NovelPlatformBinding" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'fanqie',
  "bookId" TEXT NOT NULL,
  "bookTitle" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "lastValidatedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "NovelPlatformBinding_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NovelPlatformBinding_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "PublishingPlatformCredential" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PublishPlan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT NOT NULL,
  "bindingId" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'fanqie',
  "mode" TEXT NOT NULL DEFAULT 'draft',
  "instruction" TEXT NOT NULL,
  "structuredScheduleJson" TEXT NOT NULL,
  "resolvedScheduleJson" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  "startChapterOrder" INTEGER,
  "endChapterOrder" INTEGER,
  "chaptersPerDay" INTEGER NOT NULL,
  "publishTimeOfDay" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PublishPlan_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PublishPlan_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "NovelPlatformBinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PublishDispatchJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT NOT NULL,
  "bindingId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "planId" TEXT,
  "requestId" TEXT NOT NULL,
  "externalJobId" TEXT,
  "platform" TEXT NOT NULL DEFAULT 'fanqie',
  "mode" TEXT NOT NULL,
  "plannedPublishTime" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "credentialUuid" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "bookTitle" TEXT NOT NULL,
  "chapterCount" INTEGER NOT NULL,
  "payloadSummaryJson" TEXT,
  "resultJson" TEXT,
  "lastError" TEXT,
  "submittedAt" DATETIME,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PublishDispatchJob_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PublishDispatchJob_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "NovelPlatformBinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PublishDispatchJob_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "PublishingPlatformCredential" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PublishDispatchJob_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PublishPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "PublishPlanItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "planId" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "bindingId" TEXT NOT NULL,
  "chapterId" TEXT NOT NULL,
  "chapterOrder" INTEGER NOT NULL,
  "chapterTitle" TEXT NOT NULL,
  "volumeTitle" TEXT,
  "plannedPublishTime" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'unpublished',
  "dispatchJobId" TEXT,
  "externalJobId" TEXT,
  "dispatchStatus" TEXT,
  "submittedAt" DATETIME,
  "publishedAt" DATETIME,
  "lastError" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PublishPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PublishPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PublishPlanItem_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PublishPlanItem_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "NovelPlatformBinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PublishPlanItem_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PublishPlanItem_dispatchJobId_fkey" FOREIGN KEY ("dispatchJobId") REFERENCES "PublishDispatchJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
