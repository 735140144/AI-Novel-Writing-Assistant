import type {
  BillingPackageGrant,
  BillingWalletAccount,
  WalletSummaryResponse,
} from "@ai-novel/shared/types/billing";
import { BillingPackageGrantStatus, Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { getUtc8DayKey, getUtc8StartOfDay, getNextUtc8Midnight } from "./billingTime";
import { decimalLikeToNumber, toDecimal } from "./billingTypes";
import { BillingModelPriceService } from "./BillingModelPriceService";
import { allocateBillingCharge } from "./BillingQuotaService";

function mapWallet(row: {
  userId: string;
  balanceAmount: { toString(): string };
  createdAt: Date;
  updatedAt: Date;
}): BillingWalletAccount {
  return {
    userId: row.userId,
    balanceAmount: decimalLikeToNumber(row.balanceAmount),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapGrant(row: {
  id: string;
  kind: "balance" | "monthly";
  templateId: string | null;
  dailyQuotaAmount: { toString(): string } | null;
  dailyRemainingAmount: { toString(): string } | null;
  startsAt: Date;
  expiresAt: Date;
  status: "active" | "expired" | "disabled";
  sourceRedeemCodeId: string | null;
  createdAt: Date;
  updatedAt: Date;
  template: { name: string } | null;
}): BillingPackageGrant {
  return {
    id: row.id,
    kind: row.kind,
    templateId: row.templateId,
    templateName: row.template?.name ?? "未命名套餐",
    dailyQuotaAmount: row.dailyQuotaAmount ? decimalLikeToNumber(row.dailyQuotaAmount) : null,
    dailyRemainingAmount: row.dailyRemainingAmount ? decimalLikeToNumber(row.dailyRemainingAmount) : null,
    startsAt: row.startsAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    status: row.status,
    sourceRedeemCodeId: row.sourceRedeemCodeId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class BillingWalletService {
  private readonly priceService = new BillingModelPriceService();

  async ensureWallet(userId: string) {
    return prisma.billingWalletAccount.upsert({
      where: { userId },
      create: {
        userId,
        balanceAmount: 0,
      },
      update: {},
    });
  }

  async getWallet(userId: string): Promise<BillingWalletAccount> {
    const row = await this.ensureWallet(userId);
    return mapWallet(row);
  }

  async addBalance(userId: string, amount: Prisma.Decimal | number | string) {
    const row = await prisma.billingWalletAccount.upsert({
      where: { userId },
      create: {
        userId,
        balanceAmount: amount,
      },
      update: {
        balanceAmount: { increment: amount },
      },
    });
    return mapWallet(row);
  }

  async consumeBalance(userId: string, amount: Prisma.Decimal | number | string) {
    const wallet = await this.ensureWallet(userId);
    const next = new Prisma.Decimal(wallet.balanceAmount.toString()).minus(amount);
    if (next.lessThan(0)) {
      throw new AppError("当前额度不足，无法继续使用模型。", 400);
    }
    const row = await prisma.billingWalletAccount.update({
      where: { userId },
      data: {
        balanceAmount: next,
      },
    });
    return mapWallet(row);
  }

  async refreshUserPackageQuota(userId: string, now = new Date()): Promise<void> {
    const grants = await prisma.billingPackageGrant.findMany({
      where: {
        userId,
        kind: "monthly",
        status: "active",
      },
    });
    if (grants.length === 0) {
      return;
    }

    const utc8DayKey = getUtc8DayKey(now);
    const startOfDay = getUtc8StartOfDay(now);
    const nextMidnight = getNextUtc8Midnight(now);

    for (const grant of grants) {
      if (grant.expiresAt <= now) {
        await prisma.billingPackageGrant.update({
          where: { id: grant.id },
          data: {
            status: BillingPackageGrantStatus.expired,
          },
        });
        continue;
      }
      const lastResetDayKey = grant.lastResetAt ? getUtc8DayKey(grant.lastResetAt) : null;
      if (lastResetDayKey === utc8DayKey) {
        continue;
      }
      await prisma.billingPackageGrant.update({
        where: { id: grant.id },
        data: {
          dailyRemainingAmount: grant.dailyQuotaAmount,
          lastResetAt: startOfDay < nextMidnight ? startOfDay : now,
        },
      });
    }
  }

  async listActivePackageGrants(userId: string, now = new Date()): Promise<BillingPackageGrant[]> {
    await this.refreshUserPackageQuota(userId, now);
    const rows = await prisma.billingPackageGrant.findMany({
      where: {
        userId,
        status: "active",
        expiresAt: { gt: now },
      },
      include: {
        template: {
          select: { name: true },
        },
      },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(mapGrant);
  }

  async getSummary(userId: string): Promise<WalletSummaryResponse> {
    const [wallet, activePackages, modelPrices] = await Promise.all([
      this.getWallet(userId),
      this.listActivePackageGrants(userId),
      this.priceService.listActive(),
    ]);
    const totalDailyQuotaAmount = activePackages.reduce((sum, item) => sum + (item.dailyQuotaAmount ?? 0), 0);
    const totalDailyRemainingAmount = activePackages.reduce((sum, item) => sum + (item.dailyRemainingAmount ?? 0), 0);
    return {
      wallet,
      activePackages,
      modelPrices,
      totals: {
        activePackageCount: activePackages.length,
        totalDailyQuotaAmount,
        totalDailyRemainingAmount,
      },
    };
  }

  async settleCharge(userId: string, amount: Prisma.Decimal | number | string, now = new Date()): Promise<{
    packageChargedAmount: Prisma.Decimal;
    walletChargedAmount: Prisma.Decimal;
  }> {
    const chargeAmount = toDecimal(amount);
    if (chargeAmount.lessThanOrEqualTo(0)) {
      return {
        packageChargedAmount: new Prisma.Decimal(0),
        walletChargedAmount: new Prisma.Decimal(0),
      };
    }

    return prisma.$transaction(async (tx) => {
      const utc8DayKey = getUtc8DayKey(now);
      const activeMonthlyGrants = await tx.billingPackageGrant.findMany({
        where: {
          userId,
          kind: "monthly",
          status: "active",
          expiresAt: { gt: now },
        },
        orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
      });

      for (const grant of activeMonthlyGrants) {
        const lastResetDayKey = grant.lastResetAt ? getUtc8DayKey(grant.lastResetAt) : null;
        if (lastResetDayKey === utc8DayKey) {
          continue;
        }
        await tx.billingPackageGrant.update({
          where: { id: grant.id },
          data: {
            dailyRemainingAmount: grant.dailyQuotaAmount,
            lastResetAt: getUtc8StartOfDay(now),
          },
        });
      }

      const refreshedMonthlyGrants = await tx.billingPackageGrant.findMany({
        where: {
          userId,
          kind: "monthly",
          status: "active",
          expiresAt: { gt: now },
        },
        orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
      });
      const wallet = await tx.billingWalletAccount.upsert({
        where: { userId },
        create: {
          userId,
          balanceAmount: 0,
        },
        update: {},
      });

      const packageBalance = refreshedMonthlyGrants.reduce(
        (sum, grant) => sum.plus(grant.dailyRemainingAmount ?? grant.dailyQuotaAmount ?? 0),
        new Prisma.Decimal(0),
      );
      const availableBalance = packageBalance.plus(wallet.balanceAmount);
      if (availableBalance.lessThanOrEqualTo(0)) {
        throw new AppError("当前没有可用的套餐或余额，请先兑换后再继续使用。", 400);
      }
      if (availableBalance.lessThan(chargeAmount)) {
        throw new AppError("当前额度不足，无法继续使用模型。", 400);
      }

      let remaining = chargeAmount;
      let packageChargedAmount = new Prisma.Decimal(0);
      for (const grant of refreshedMonthlyGrants) {
        if (remaining.lessThanOrEqualTo(0)) {
          break;
        }
        const currentRemaining = new Prisma.Decimal(grant.dailyRemainingAmount?.toString() ?? grant.dailyQuotaAmount?.toString() ?? 0);
        if (currentRemaining.lessThanOrEqualTo(0)) {
          continue;
        }
        const charged = Prisma.Decimal.min(currentRemaining, remaining);
        remaining = remaining.minus(charged);
        packageChargedAmount = packageChargedAmount.plus(charged);
        await tx.billingPackageGrant.update({
          where: { id: grant.id },
          data: {
            dailyRemainingAmount: currentRemaining.minus(charged),
          },
        });
      }

      const walletChargedAmount = remaining;
      if (walletChargedAmount.greaterThan(0)) {
        await tx.billingWalletAccount.update({
          where: { userId },
          data: {
            balanceAmount: new Prisma.Decimal(wallet.balanceAmount.toString()).minus(walletChargedAmount),
          },
        });
      }

      return {
        packageChargedAmount,
        walletChargedAmount,
      };
    });
  }

  async resolveEstimateAvailability(userId: string, chargeAmount: Prisma.Decimal): Promise<void> {
    const summary = await this.getSummary(userId);
    const available = summary.totals.totalDailyRemainingAmount + summary.wallet.balanceAmount;
    if (available <= 0) {
      throw new AppError("当前没有可用的套餐或余额，请先兑换后再继续使用。", 400);
    }
    if (available < Number(chargeAmount.toString())) {
      throw new AppError("当前额度不足，无法继续使用模型。", 400);
    }
  }
}
