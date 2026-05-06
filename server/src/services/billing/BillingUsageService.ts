import type { BillingDailyUsageSummary } from "@ai-novel/shared/types/billing";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { getUtc8DayKey } from "./billingTime";
import { ONE_MILLION, decimalLikeToNumber, roundMoney, type BillingChargeResult, type BillingTokenUsage } from "./billingTypes";

export function calculateBillingCharge(input: {
  usage: BillingTokenUsage;
  inputPricePerM: Prisma.Decimal | number | string;
  outputPricePerM: Prisma.Decimal | number | string;
  cacheHitPricePerM: Prisma.Decimal | number | string;
}): BillingChargeResult {
  const inputCost = roundMoney(new Prisma.Decimal(input.usage.promptTokens).div(ONE_MILLION).mul(input.inputPricePerM));
  const outputCost = roundMoney(new Prisma.Decimal(input.usage.completionTokens).div(ONE_MILLION).mul(input.outputPricePerM));
  const cacheHitCost = roundMoney(new Prisma.Decimal(input.usage.cacheHitTokens).div(ONE_MILLION).mul(input.cacheHitPricePerM));
  return {
    inputCost,
    outputCost,
    cacheHitCost,
    totalCost: roundMoney(inputCost.plus(outputCost).plus(cacheHitCost)),
  };
}

function mapDaily(row: {
  dayKey: string;
  moneySpent: { toString(): string };
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  totalTokens: number;
  callCount: number;
}): BillingDailyUsageSummary {
  return {
    dayKey: row.dayKey,
    moneySpent: decimalLikeToNumber(row.moneySpent),
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    cacheHitTokens: row.cacheHitTokens,
    totalTokens: row.totalTokens,
    callCount: row.callCount,
  };
}

export class BillingUsageService {
  calculateBillingCharge = calculateBillingCharge;

  async recordUsage(input: {
    userId: string;
    sourceType: string;
    sourceId?: string | null;
    provider: string;
    model: string;
    taskType?: string | null;
    usage: BillingTokenUsage;
    charge: BillingChargeResult;
    chargedFromPackageAmount: Prisma.Decimal | number | string;
    chargedFromWalletAmount: Prisma.Decimal | number | string;
    createdAt?: Date;
  }): Promise<void> {
    const createdAt = input.createdAt ?? new Date();
    const dayKey = getUtc8DayKey(createdAt);
    await prisma.$transaction([
      prisma.billingUsageRecord.create({
        data: {
          userId: input.userId,
          sourceType: input.sourceType,
          sourceId: input.sourceId ?? null,
          provider: input.provider,
          model: input.model,
          taskType: input.taskType ?? null,
          promptTokens: input.usage.promptTokens,
          completionTokens: input.usage.completionTokens,
          cacheHitTokens: input.usage.cacheHitTokens,
          totalTokens: input.usage.totalTokens,
          inputCost: input.charge.inputCost,
          outputCost: input.charge.outputCost,
          cacheHitCost: input.charge.cacheHitCost,
          totalCost: input.charge.totalCost,
          chargedFromPackageAmount: input.chargedFromPackageAmount,
          chargedFromWalletAmount: input.chargedFromWalletAmount,
          dayKey,
          createdAt,
        },
      }),
      prisma.billingDailyUsageSummary.upsert({
        where: {
          userId_dayKey: {
            userId: input.userId,
            dayKey,
          },
        },
        create: {
          userId: input.userId,
          dayKey,
          moneySpent: input.charge.totalCost,
          promptTokens: input.usage.promptTokens,
          completionTokens: input.usage.completionTokens,
          cacheHitTokens: input.usage.cacheHitTokens,
          totalTokens: input.usage.totalTokens,
          callCount: 1,
        },
        update: {
          moneySpent: { increment: input.charge.totalCost },
          promptTokens: { increment: input.usage.promptTokens },
          completionTokens: { increment: input.usage.completionTokens },
          cacheHitTokens: { increment: input.usage.cacheHitTokens },
          totalTokens: { increment: input.usage.totalTokens },
          callCount: { increment: 1 },
        },
      }),
    ]);
  }

  async listDailyUsage(userId: string, days = 30): Promise<BillingDailyUsageSummary[]> {
    const rows = await prisma.billingDailyUsageSummary.findMany({
      where: { userId },
      orderBy: [{ dayKey: "desc" }],
      take: Math.max(1, Math.min(days, 180)),
    });
    return rows.reverse().map(mapDaily);
  }
}
