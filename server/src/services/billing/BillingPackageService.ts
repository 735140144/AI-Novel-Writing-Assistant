import type { BillingPackageTemplate } from "@ai-novel/shared/types/billing";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { decimalLikeToNumber } from "./billingTypes";

function mapTemplate(row: {
  id: string;
  kind: "balance" | "monthly";
  name: string;
  description: string | null;
  balanceAmount: { toString(): string } | null;
  dailyQuotaAmount: { toString(): string } | null;
  durationDays: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): BillingPackageTemplate {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    balanceAmount: row.balanceAmount ? decimalLikeToNumber(row.balanceAmount) : null,
    dailyQuotaAmount: row.dailyQuotaAmount ? decimalLikeToNumber(row.dailyQuotaAmount) : null,
    durationDays: row.durationDays,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class BillingPackageService {
  async listAll(): Promise<BillingPackageTemplate[]> {
    const rows = await prisma.billingPackageTemplate.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(mapTemplate);
  }

  async create(input: {
    kind: "balance" | "monthly";
    name: string;
    description?: string;
    balanceAmount?: number | null;
    dailyQuotaAmount?: number | null;
    durationDays?: number;
    isActive?: boolean;
    sortOrder?: number;
  }): Promise<BillingPackageTemplate> {
    this.assertTemplateShape(input);
    const row = await prisma.billingPackageTemplate.create({
      data: {
        kind: input.kind,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        balanceAmount: input.kind === "balance" ? (input.balanceAmount ?? 0) : null,
        dailyQuotaAmount: input.kind === "monthly" ? (input.dailyQuotaAmount ?? 0) : null,
        durationDays: input.kind === "monthly" ? (input.durationDays ?? 30) : 0,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    return mapTemplate(row);
  }

  async update(id: string, input: {
    name: string;
    description?: string;
    balanceAmount?: number | null;
    dailyQuotaAmount?: number | null;
    durationDays?: number;
    isActive?: boolean;
    sortOrder?: number;
  }): Promise<BillingPackageTemplate> {
    const current = await prisma.billingPackageTemplate.findUnique({ where: { id } });
    if (!current) {
      throw new AppError("套餐不存在。", 404);
    }
    this.assertTemplateShape({
      kind: current.kind,
      name: input.name,
      balanceAmount: input.balanceAmount,
      dailyQuotaAmount: input.dailyQuotaAmount,
      durationDays: input.durationDays,
    });
    const row = await prisma.billingPackageTemplate.update({
      where: { id },
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        balanceAmount: current.kind === "balance" ? (input.balanceAmount ?? 0) : null,
        dailyQuotaAmount: current.kind === "monthly" ? (input.dailyQuotaAmount ?? 0) : null,
        durationDays: current.kind === "monthly" ? (input.durationDays ?? 30) : 0,
        isActive: input.isActive ?? current.isActive,
        sortOrder: input.sortOrder ?? current.sortOrder,
      },
    });
    return mapTemplate(row);
  }

  async getById(id: string) {
    const row = await prisma.billingPackageTemplate.findUnique({ where: { id } });
    if (!row) {
      throw new AppError("套餐不存在。", 404);
    }
    return row;
  }

  private assertTemplateShape(input: {
    kind: "balance" | "monthly";
    name: string;
    balanceAmount?: number | null;
    dailyQuotaAmount?: number | null;
    durationDays?: number;
  }): void {
    if (!input.name.trim()) {
      throw new AppError("套餐名称不能为空。", 400);
    }
    if (input.kind === "balance" && (!input.balanceAmount || input.balanceAmount <= 0)) {
      throw new AppError("总额度套餐需要填写大于 0 的余额。", 400);
    }
    if (input.kind === "monthly" && (!input.dailyQuotaAmount || input.dailyQuotaAmount <= 0)) {
      throw new AppError("包月套餐需要填写大于 0 的每日额度。", 400);
    }
  }
}
