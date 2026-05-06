CREATE TYPE "BillingPackageKind" AS ENUM ('balance', 'monthly');
CREATE TYPE "BillingRedeemCodeStatus" AS ENUM ('unused', 'redeemed', 'expired', 'disabled');
CREATE TYPE "BillingPackageGrantStatus" AS ENUM ('active', 'expired', 'disabled');

CREATE TABLE "BillingModelPrice" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "inputPricePerM" DECIMAL(20,8) NOT NULL,
  "outputPricePerM" DECIMAL(20,8) NOT NULL,
  "cacheHitPricePerM" DECIMAL(20,8) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingModelPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingModelPrice_provider_model_key" ON "BillingModelPrice"("provider", "model");
CREATE INDEX "BillingModelPrice_provider_isActive_idx" ON "BillingModelPrice"("provider", "isActive");

CREATE TABLE "BillingPackageTemplate" (
  "id" TEXT NOT NULL,
  "kind" "BillingPackageKind" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "balanceAmount" DECIMAL(20,8),
  "dailyQuotaAmount" DECIMAL(20,8),
  "durationDays" INTEGER NOT NULL DEFAULT 30,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingPackageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillingPackageTemplate_kind_isActive_sortOrder_idx" ON "BillingPackageTemplate"("kind", "isActive", "sortOrder");

CREATE TABLE "BillingRedeemCode" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "kind" "BillingPackageKind" NOT NULL,
  "templateId" TEXT,
  "status" "BillingRedeemCodeStatus" NOT NULL DEFAULT 'unused',
  "expiresAt" TIMESTAMP(3),
  "redeemedAt" TIMESTAMP(3),
  "redeemedByUserId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingRedeemCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingRedeemCode_code_key" ON "BillingRedeemCode"("code");
CREATE INDEX "BillingRedeemCode_status_createdAt_idx" ON "BillingRedeemCode"("status", "createdAt");
CREATE INDEX "BillingRedeemCode_redeemedByUserId_idx" ON "BillingRedeemCode"("redeemedByUserId");
CREATE INDEX "BillingRedeemCode_createdByUserId_idx" ON "BillingRedeemCode"("createdByUserId");

CREATE TABLE "BillingWalletAccount" (
  "userId" TEXT NOT NULL,
  "balanceAmount" DECIMAL(20,8) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingWalletAccount_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "BillingWalletAccount_balanceAmount_idx" ON "BillingWalletAccount"("balanceAmount");

CREATE TABLE "BillingPackageGrant" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "templateId" TEXT,
  "kind" "BillingPackageKind" NOT NULL,
  "dailyQuotaAmount" DECIMAL(20,8),
  "dailyRemainingAmount" DECIMAL(20,8),
  "startsAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastResetAt" TIMESTAMP(3),
  "status" "BillingPackageGrantStatus" NOT NULL DEFAULT 'active',
  "sourceRedeemCodeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingPackageGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillingPackageGrant_userId_status_expiresAt_idx" ON "BillingPackageGrant"("userId", "status", "expiresAt");
CREATE INDEX "BillingPackageGrant_userId_kind_status_idx" ON "BillingPackageGrant"("userId", "kind", "status");
CREATE INDEX "BillingPackageGrant_sourceRedeemCodeId_idx" ON "BillingPackageGrant"("sourceRedeemCodeId");

CREATE TABLE "BillingUsageRecord" (
  "id" TEXT NOT NULL,
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
  "inputCost" DECIMAL(20,8) NOT NULL,
  "outputCost" DECIMAL(20,8) NOT NULL,
  "cacheHitCost" DECIMAL(20,8) NOT NULL,
  "totalCost" DECIMAL(20,8) NOT NULL,
  "chargedFromPackageAmount" DECIMAL(20,8) NOT NULL,
  "chargedFromWalletAmount" DECIMAL(20,8) NOT NULL,
  "dayKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingUsageRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillingUsageRecord_userId_dayKey_idx" ON "BillingUsageRecord"("userId", "dayKey");
CREATE INDEX "BillingUsageRecord_userId_createdAt_idx" ON "BillingUsageRecord"("userId", "createdAt");
CREATE INDEX "BillingUsageRecord_provider_model_idx" ON "BillingUsageRecord"("provider", "model");

CREATE TABLE "BillingDailyUsageSummary" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dayKey" TEXT NOT NULL,
  "moneySpent" DECIMAL(20,8) NOT NULL,
  "promptTokens" INTEGER NOT NULL DEFAULT 0,
  "completionTokens" INTEGER NOT NULL DEFAULT 0,
  "cacheHitTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "callCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingDailyUsageSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingDailyUsageSummary_userId_dayKey_key" ON "BillingDailyUsageSummary"("userId", "dayKey");
CREATE INDEX "BillingDailyUsageSummary_userId_dayKey_idx" ON "BillingDailyUsageSummary"("userId", "dayKey");

ALTER TABLE "BillingRedeemCode" ADD CONSTRAINT "BillingRedeemCode_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BillingPackageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingRedeemCode" ADD CONSTRAINT "BillingRedeemCode_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingRedeemCode" ADD CONSTRAINT "BillingRedeemCode_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingWalletAccount" ADD CONSTRAINT "BillingWalletAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingPackageGrant" ADD CONSTRAINT "BillingPackageGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingPackageGrant" ADD CONSTRAINT "BillingPackageGrant_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BillingPackageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingPackageGrant" ADD CONSTRAINT "BillingPackageGrant_sourceRedeemCodeId_fkey" FOREIGN KEY ("sourceRedeemCodeId") REFERENCES "BillingRedeemCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingUsageRecord" ADD CONSTRAINT "BillingUsageRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingDailyUsageSummary" ADD CONSTRAINT "BillingDailyUsageSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
