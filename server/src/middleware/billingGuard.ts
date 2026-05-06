import { AppError } from "./errorHandler";
import { BillingModelPriceService } from "../services/billing/BillingModelPriceService";
import { BillingUsageService, calculateBillingCharge } from "../services/billing/BillingUsageService";
import { BillingWalletService } from "../services/billing/BillingWalletService";

const billingModelPriceService = new BillingModelPriceService();
const billingWalletService = new BillingWalletService();
const billingUsageService = new BillingUsageService();

export interface BillingPreviewInput {
  userId?: string | null;
  provider: string;
  model: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  cacheHitTokens?: number | null;
  totalTokens?: number | null;
  skipBilling?: boolean;
}

export interface BillingSettlementInput {
  userId?: string | null;
  provider: string;
  model: string;
  taskType?: string | null;
  sourceType: string;
  sourceId?: string | null;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  totalTokens: number;
  skipBilling?: boolean;
}

function normalizePositiveInteger(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

function shouldSkipBilling(userId?: string | null, skipBilling?: boolean): boolean {
  return skipBilling === true || !userId?.trim();
}

export async function ensureBillingAllowance(input: BillingPreviewInput): Promise<void> {
  if (shouldSkipBilling(input.userId, input.skipBilling)) {
    return;
  }

  const userId = input.userId!.trim();
  const modelPrice = await billingModelPriceService.requireActivePrice(input.provider, input.model);
  const charge = calculateBillingCharge({
    usage: {
      promptTokens: normalizePositiveInteger(input.promptTokens),
      completionTokens: normalizePositiveInteger(input.completionTokens),
      cacheHitTokens: normalizePositiveInteger(input.cacheHitTokens),
      totalTokens: normalizePositiveInteger(input.totalTokens)
        || (normalizePositiveInteger(input.promptTokens) + normalizePositiveInteger(input.completionTokens)),
    },
    inputPricePerM: modelPrice.inputPricePerM,
    outputPricePerM: modelPrice.outputPricePerM,
    cacheHitPricePerM: modelPrice.cacheHitPricePerM,
  });
  if (charge.totalCost.lessThanOrEqualTo(0)) {
    return;
  }
  await billingWalletService.resolveEstimateAvailability(userId, charge.totalCost);
}

export async function settleBillingCharge(input: BillingSettlementInput): Promise<void> {
  if (shouldSkipBilling(input.userId, input.skipBilling)) {
    return;
  }

  const userId = input.userId!.trim();
  const modelPrice = await billingModelPriceService.requireActivePrice(input.provider, input.model);
  const charge = calculateBillingCharge({
      usage: {
        promptTokens: normalizePositiveInteger(input.promptTokens),
        completionTokens: normalizePositiveInteger(input.completionTokens),
        cacheHitTokens: normalizePositiveInteger(input.cacheHitTokens),
        totalTokens: normalizePositiveInteger(input.totalTokens),
    },
    inputPricePerM: modelPrice.inputPricePerM,
    outputPricePerM: modelPrice.outputPricePerM,
    cacheHitPricePerM: modelPrice.cacheHitPricePerM,
  });
  if (charge.totalCost.lessThanOrEqualTo(0)) {
    return;
  }

  const settled = await billingWalletService.settleCharge(userId, charge.totalCost);
  await billingUsageService.recordUsage({
    userId,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? null,
    provider: input.provider,
    model: input.model,
    taskType: input.taskType ?? null,
    usage: {
      promptTokens: normalizePositiveInteger(input.promptTokens),
      completionTokens: normalizePositiveInteger(input.completionTokens),
      cacheHitTokens: normalizePositiveInteger(input.cacheHitTokens),
      totalTokens: normalizePositiveInteger(input.totalTokens),
    },
    charge,
    chargedFromPackageAmount: settled.packageChargedAmount,
    chargedFromWalletAmount: settled.walletChargedAmount,
  });
}

export function requireBillingUserId(userId?: string | null): string {
  if (!userId?.trim()) {
    throw new AppError("未登录，请先登录。", 401);
  }
  return userId.trim();
}
