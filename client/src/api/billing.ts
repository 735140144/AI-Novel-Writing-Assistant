import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  BillingDailyUsageSummary,
  BillingModelPrice,
  BillingPackageGrant,
  BillingPackageTemplate,
  BillingRedeemCode,
  WalletRedeemCodeHistoryItem,
  WalletSummaryResponse,
} from "@ai-novel/shared/types/billing";
import { apiClient } from "./client";

export async function getWalletSummary() {
  const { data } = await apiClient.get<ApiResponse<WalletSummaryResponse>>("/wallet/summary");
  return data;
}

export async function getWalletDailyUsage(days = 30) {
  const { data } = await apiClient.get<ApiResponse<BillingDailyUsageSummary[]>>("/wallet/usage-daily", {
    params: { days },
  });
  return data;
}

export async function getWalletRedeemHistory() {
  const { data } = await apiClient.get<ApiResponse<WalletRedeemCodeHistoryItem[]>>("/wallet/redeem-codes");
  return data;
}

export async function consumeWalletRedeemCode(code: string) {
  const { data } = await apiClient.post<ApiResponse<WalletSummaryResponse>>("/wallet/redeem-codes/consume", { code });
  return data;
}

export async function getBillingModelPrices() {
  const { data } = await apiClient.get<ApiResponse<BillingModelPrice[]>>("/settings/billing/model-prices");
  return data;
}

export async function saveBillingModelPrices(items: Array<{
  provider: string;
  model: string;
  inputPricePerM: number;
  outputPricePerM: number;
  cacheHitPricePerM: number;
  isActive?: boolean;
}>) {
  const { data } = await apiClient.put<ApiResponse<BillingModelPrice[]>>("/settings/billing/model-prices", { items });
  return data;
}

export async function getBillingPackageTemplates() {
  const { data } = await apiClient.get<ApiResponse<BillingPackageTemplate[]>>("/settings/billing/package-templates");
  return data;
}

export async function createBillingPackageTemplate(payload: {
  kind: "balance" | "monthly";
  name: string;
  description?: string;
  balanceAmount?: number | null;
  dailyQuotaAmount?: number | null;
  durationDays?: number;
  isActive?: boolean;
  sortOrder?: number;
}) {
  const { data } = await apiClient.post<ApiResponse<BillingPackageTemplate>>("/settings/billing/package-templates", payload);
  return data;
}

export async function updateBillingPackageTemplate(
  id: string,
  payload: {
    name: string;
    description?: string;
    balanceAmount?: number | null;
    dailyQuotaAmount?: number | null;
    durationDays?: number;
    isActive?: boolean;
    sortOrder?: number;
  },
) {
  const { data } = await apiClient.put<ApiResponse<BillingPackageTemplate>>(`/settings/billing/package-templates/${id}`, payload);
  return data;
}

export async function getBillingRedeemCodes() {
  const { data } = await apiClient.get<ApiResponse<BillingRedeemCode[]>>("/settings/billing/redeem-codes");
  return data;
}

export async function createBillingRedeemCodes(payload: {
  templateId: string;
  count: number;
  expiresAt?: string;
}) {
  const { data } = await apiClient.post<ApiResponse<BillingRedeemCode[]>>("/settings/billing/redeem-codes", payload);
  return data;
}

export async function updateBillingRedeemCodeStatus(id: string, status: BillingRedeemCode["status"]) {
  const { data } = await apiClient.put<ApiResponse<BillingRedeemCode>>(`/settings/billing/redeem-codes/${id}`, { status });
  return data;
}
