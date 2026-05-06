export type BillingPackageKind = "balance" | "monthly";

export type BillingRedeemCodeStatus = "unused" | "redeemed" | "expired" | "disabled";

export type BillingPackageGrantStatus = "active" | "expired" | "disabled";

export interface BillingModelPrice {
  id: string;
  provider: string;
  model: string;
  inputPricePerM: number;
  outputPricePerM: number;
  cacheHitPricePerM: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BillingPackageTemplate {
  id: string;
  kind: BillingPackageKind;
  name: string;
  description: string | null;
  balanceAmount: number | null;
  dailyQuotaAmount: number | null;
  durationDays: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BillingRedeemCode {
  id: string;
  code: string;
  kind: BillingPackageKind;
  status: BillingRedeemCodeStatus;
  templateId: string | null;
  templateName: string;
  balanceAmount: number | null;
  dailyQuotaAmount: number | null;
  durationDays: number | null;
  expiresAt: string | null;
  redeemedAt: string | null;
  redeemedByUserId: string | null;
  redeemedByUserEmail: string | null;
  createdByUserId: string | null;
  createdByUserEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillingWalletAccount {
  userId: string;
  balanceAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BillingPackageGrant {
  id: string;
  kind: BillingPackageKind;
  templateId: string | null;
  templateName: string;
  dailyQuotaAmount: number | null;
  dailyRemainingAmount: number | null;
  startsAt: string;
  expiresAt: string;
  status: BillingPackageGrantStatus;
  sourceRedeemCodeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillingUsageRecord {
  id: string;
  userId: string;
  sourceType: string;
  sourceId: string | null;
  provider: string;
  model: string;
  taskType: string | null;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  cacheHitCost: number;
  totalCost: number;
  chargedFromPackageAmount: number;
  chargedFromWalletAmount: number;
  dayKey: string;
  createdAt: string;
}

export interface BillingDailyUsageSummary {
  dayKey: string;
  moneySpent: number;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  totalTokens: number;
  callCount: number;
}

export interface WalletSummaryResponse {
  wallet: BillingWalletAccount;
  activePackages: BillingPackageGrant[];
  modelPrices: BillingModelPrice[];
  totals: {
    activePackageCount: number;
    totalDailyQuotaAmount: number;
    totalDailyRemainingAmount: number;
  };
}

export interface WalletRedeemCodeHistoryItem {
  id: string;
  code: string;
  templateName: string;
  kind: BillingPackageKind;
  redeemedAt: string;
}

