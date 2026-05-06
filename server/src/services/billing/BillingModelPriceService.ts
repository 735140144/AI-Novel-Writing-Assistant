import type { BillingModelPrice } from "@ai-novel/shared/types/billing";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { decimalLikeToNumber } from "./billingTypes";

function mapModelPrice(row: {
  id: string;
  provider: string;
  model: string;
  inputPricePerM: { toString(): string };
  outputPricePerM: { toString(): string };
  cacheHitPricePerM: { toString(): string };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): BillingModelPrice {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    inputPricePerM: decimalLikeToNumber(row.inputPricePerM),
    outputPricePerM: decimalLikeToNumber(row.outputPricePerM),
    cacheHitPricePerM: decimalLikeToNumber(row.cacheHitPricePerM),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class BillingModelPriceService {
  async listAll(): Promise<BillingModelPrice[]> {
    const rows = await prisma.billingModelPrice.findMany({
      orderBy: [{ provider: "asc" }, { model: "asc" }],
    });
    return rows.map(mapModelPrice);
  }

  async listActive(): Promise<BillingModelPrice[]> {
    const rows = await prisma.billingModelPrice.findMany({
      where: { isActive: true },
      orderBy: [{ provider: "asc" }, { model: "asc" }],
    });
    return rows.map(mapModelPrice);
  }

  async upsertMany(items: Array<{
    provider: string;
    model: string;
    inputPricePerM: number;
    outputPricePerM: number;
    cacheHitPricePerM: number;
    isActive?: boolean;
  }>): Promise<BillingModelPrice[]> {
    for (const item of items) {
      await prisma.billingModelPrice.upsert({
        where: {
          provider_model: {
            provider: item.provider.trim(),
            model: item.model.trim(),
          },
        },
        create: {
          provider: item.provider.trim(),
          model: item.model.trim(),
          inputPricePerM: item.inputPricePerM,
          outputPricePerM: item.outputPricePerM,
          cacheHitPricePerM: item.cacheHitPricePerM,
          isActive: item.isActive ?? true,
        },
        update: {
          inputPricePerM: item.inputPricePerM,
          outputPricePerM: item.outputPricePerM,
          cacheHitPricePerM: item.cacheHitPricePerM,
          isActive: item.isActive ?? true,
        },
      });
    }

    return this.listAll();
  }

  async requireActivePrice(provider: string, model: string) {
    const row = await prisma.billingModelPrice.findUnique({
      where: {
        provider_model: {
          provider: provider.trim(),
          model: model.trim(),
        },
      },
    });
    if (!row || !row.isActive) {
      throw new AppError("当前模型还没有配置价格，请联系管理员。", 400);
    }
    return row;
  }
}
