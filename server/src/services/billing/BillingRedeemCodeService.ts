import crypto from "node:crypto";
import type {
  BillingRedeemCode,
  BillingRedeemCodeStatus,
  WalletRedeemCodeHistoryItem,
} from "@ai-novel/shared/types/billing";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { BillingPackageService } from "./BillingPackageService";
import { BillingWalletService } from "./BillingWalletService";
import { decimalLikeToNumber } from "./billingTypes";

function createCode(): string {
  return crypto.randomBytes(6).toString("base64url").toUpperCase();
}

function mapRedeemCode(row: {
  id: string;
  code: string;
  kind: "balance" | "monthly";
  status: "unused" | "redeemed" | "expired" | "disabled";
  expiresAt: Date | null;
  redeemedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  templateId: string | null;
  template: {
    name: string;
    balanceAmount: { toString(): string } | null;
    dailyQuotaAmount: { toString(): string } | null;
    durationDays: number;
  } | null;
  redeemedByUser: { id: string; email: string } | null;
  createdByUser: { id: string; email: string } | null;
}): BillingRedeemCode {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    status: row.status,
    templateId: row.templateId,
    templateName: row.template?.name ?? "未命名套餐",
    balanceAmount: row.template?.balanceAmount ? decimalLikeToNumber(row.template.balanceAmount) : null,
    dailyQuotaAmount: row.template?.dailyQuotaAmount ? decimalLikeToNumber(row.template.dailyQuotaAmount) : null,
    durationDays: row.template?.durationDays ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    redeemedAt: row.redeemedAt?.toISOString() ?? null,
    redeemedByUserId: row.redeemedByUser?.id ?? null,
    redeemedByUserEmail: row.redeemedByUser?.email ?? null,
    createdByUserId: row.createdByUser?.id ?? null,
    createdByUserEmail: row.createdByUser?.email ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class BillingRedeemCodeService {
  private readonly packageService = new BillingPackageService();
  private readonly walletService = new BillingWalletService();

  async listAll(): Promise<BillingRedeemCode[]> {
    const rows = await prisma.billingRedeemCode.findMany({
      include: {
        template: true,
        redeemedByUser: { select: { id: true, email: true } },
        createdByUser: { select: { id: true, email: true } },
      },
      orderBy: [{ createdAt: "desc" }],
    });
    return rows.map(mapRedeemCode);
  }

  async createMany(input: {
    templateId: string;
    count: number;
    expiresAt?: string | null;
    createdByUserId?: string;
  }): Promise<BillingRedeemCode[]> {
    const template = await this.packageService.getById(input.templateId);
    const count = Math.max(1, Math.min(200, Math.floor(input.count)));
    const rows: BillingRedeemCode[] = [];
    for (let index = 0; index < count; index += 1) {
      const created = await prisma.billingRedeemCode.create({
        data: {
          code: createCode(),
          kind: template.kind,
          templateId: template.id,
          status: "unused",
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdByUserId: input.createdByUserId?.trim() || null,
        },
        include: {
          template: true,
          redeemedByUser: { select: { id: true, email: true } },
          createdByUser: { select: { id: true, email: true } },
        },
      });
      rows.push(mapRedeemCode(created));
    }
    return rows;
  }

  async updateStatus(id: string, status: BillingRedeemCodeStatus): Promise<BillingRedeemCode> {
    const row = await prisma.billingRedeemCode.update({
      where: { id },
      data: { status },
      include: {
        template: true,
        redeemedByUser: { select: { id: true, email: true } },
        createdByUser: { select: { id: true, email: true } },
      },
    });
    return mapRedeemCode(row);
  }

  async listUserRedeemedCodes(userId: string): Promise<WalletRedeemCodeHistoryItem[]> {
    const rows = await prisma.billingRedeemCode.findMany({
      where: {
        redeemedByUserId: userId,
        redeemedAt: { not: null },
      },
      include: {
        template: {
          select: { name: true },
        },
      },
      orderBy: [{ redeemedAt: "desc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      templateName: row.template?.name ?? "未命名套餐",
      kind: row.kind,
      redeemedAt: row.redeemedAt?.toISOString() ?? row.updatedAt.toISOString(),
    }));
  }

  async consumeCode(userId: string, rawCode: string): Promise<void> {
    const code = rawCode.trim().toUpperCase();
    if (!code) {
      throw new AppError("请输入兑换码。", 400);
    }

    await prisma.$transaction(async (tx) => {
      const row = await tx.billingRedeemCode.findUnique({
        where: { code },
        include: { template: true },
      });
      if (!row) {
        throw new AppError("兑换码无效、已过期或已使用。", 400);
      }
      if (row.status !== "unused") {
        throw new AppError("兑换码无效、已过期或已使用。", 400);
      }
      if (row.expiresAt && row.expiresAt <= new Date()) {
        await tx.billingRedeemCode.update({
          where: { id: row.id },
          data: { status: "expired" },
        });
        throw new AppError("兑换码无效、已过期或已使用。", 400);
      }
      if (!row.template) {
        throw new AppError("兑换码关联的套餐不存在。", 400);
      }

      if (row.kind === "balance") {
        const amount = row.template.balanceAmount ?? new Prisma.Decimal(0);
        await tx.billingWalletAccount.upsert({
          where: { userId },
          create: {
            userId,
            balanceAmount: amount,
          },
          update: {
            balanceAmount: { increment: amount },
          },
        });
      } else {
        const startsAt = new Date();
        const expiresAt = new Date(startsAt.getTime() + row.template.durationDays * 24 * 60 * 60 * 1000);
        await tx.billingPackageGrant.create({
          data: {
            userId,
            templateId: row.template.id,
            kind: row.kind,
            dailyQuotaAmount: row.template.dailyQuotaAmount ?? new Prisma.Decimal(0),
            dailyRemainingAmount: row.template.dailyQuotaAmount ?? new Prisma.Decimal(0),
            startsAt,
            expiresAt,
            lastResetAt: startsAt,
            status: "active",
            sourceRedeemCodeId: row.id,
          },
        });
      }

      await tx.billingRedeemCode.update({
        where: { id: row.id },
        data: {
          status: "redeemed",
          redeemedAt: new Date(),
          redeemedByUserId: userId,
        },
      });
    });

    await this.walletService.ensureWallet(userId);
  }
}
