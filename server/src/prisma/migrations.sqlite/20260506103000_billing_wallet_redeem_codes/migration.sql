CREATE TABLE "BillingModelPrice" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "inputPricePerM" DECIMAL NOT NULL,
  "outputPricePerM" DECIMAL NOT NULL,
  "cacheHitPricePerM" DECIMAL NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "BillingModelPrice_provider_model_key"
ON "BillingModelPrice"("provider", "model");

CREATE INDEX "BillingModelPrice_provider_isActive_idx"
ON "BillingModelPrice"("provider", "isActive");

CREATE TABLE "BillingPackageTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "balanceAmount" DECIMAL,
  "dailyQuotaAmount" DECIMAL,
  "durationDays" INTEGER NOT NULL DEFAULT 30,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "BillingPackageTemplate_kind_isActive_sortOrder_idx"
ON "BillingPackageTemplate"("kind", "isActive", "sortOrder");

CREATE TABLE "BillingRedeemCode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "templateId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'unused',
  "expiresAt" DATETIME,
  "redeemedAt" DATETIME,
  "redeemedByUserId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "BillingRedeemCode_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BillingPackageTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BillingRedeemCode_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BillingRedeemCode_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BillingRedeemCode_code_key"
ON "BillingRedeemCode"("code");

CREATE INDEX "BillingRedeemCode_status_createdAt_idx"
ON "BillingRedeemCode"("status", "createdAt");

CREATE INDEX "BillingRedeemCode_redeemedByUserId_idx"
ON "BillingRedeemCode"("redeemedByUserId");

CREATE INDEX "BillingRedeemCode_createdByUserId_idx"
ON "BillingRedeemCode"("createdByUserId");

CREATE TABLE "BillingWalletAccount" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "balanceAmount" DECIMAL NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "BillingWalletAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "BillingWalletAccount_balanceAmount_idx"
ON "BillingWalletAccount"("balanceAmount");

CREATE TABLE "BillingPackageGrant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "templateId" TEXT,
  "kind" TEXT NOT NULL,
  "dailyQuotaAmount" DECIMAL,
  "dailyRemainingAmount" DECIMAL,
  "startsAt" DATETIME NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "lastResetAt" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'active',
  "sourceRedeemCodeId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "BillingPackageGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BillingPackageGrant_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BillingPackageTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BillingPackageGrant_sourceRedeemCodeId_fkey" FOREIGN KEY ("sourceRedeemCodeId") REFERENCES "BillingRedeemCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "BillingPackageGrant_userId_status_expiresAt_idx"
ON "BillingPackageGrant"("userId", "status", "expiresAt");

CREATE INDEX "BillingPackageGrant_userId_kind_status_idx"
ON "BillingPackageGrant"("userId", "kind", "status");

CREATE INDEX "BillingPackageGrant_sourceRedeemCodeId_idx"
ON "BillingPackageGrant"("sourceRedeemCodeId");

CREATE TABLE "BillingUsageRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "taskType" TEXT,
  "promptTokens" INTEGER NOT NULL DEFAULT 0,
  "completionTokens" INTEGER NOT NULL DEFAULT 0,
  "cacheHitTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "inputCost" DECIMAL NOT NULL,
  "outputCost" DECIMAL NOT NULL,
  "cacheHitCost" DECIMAL NOT NULL,
  "totalCost" DECIMAL NOT NULL,
  "chargedFromPackageAmount" DECIMAL NOT NULL,
  "chargedFromWalletAmount" DECIMAL NOT NULL,
  "dayKey" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingUsageRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "BillingUsageRecord_userId_dayKey_idx"
ON "BillingUsageRecord"("userId", "dayKey");

CREATE INDEX "BillingUsageRecord_userId_createdAt_idx"
ON "BillingUsageRecord"("userId", "createdAt");

CREATE INDEX "BillingUsageRecord_provider_model_idx"
ON "BillingUsageRecord"("provider", "model");

CREATE TABLE "BillingDailyUsageSummary" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "dayKey" TEXT NOT NULL,
  "moneySpent" DECIMAL NOT NULL,
  "promptTokens" INTEGER NOT NULL DEFAULT 0,
  "completionTokens" INTEGER NOT NULL DEFAULT 0,
  "cacheHitTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "callCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "BillingDailyUsageSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BillingDailyUsageSummary_userId_dayKey_key"
ON "BillingDailyUsageSummary"("userId", "dayKey");

CREATE INDEX "BillingDailyUsageSummary_userId_dayKey_idx"
ON "BillingDailyUsageSummary"("userId", "dayKey");
