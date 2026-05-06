const test = require("node:test");
const assert = require("node:assert/strict");

const { Prisma } = require("@prisma/client");

const { calculateBillingCharge, BillingUsageService } = require("../dist/services/billing/BillingUsageService.js");
const { BillingWalletService } = require("../dist/services/billing/BillingWalletService.js");
const { BillingRedeemCodeService } = require("../dist/services/billing/BillingRedeemCodeService.js");
const { BillingPackageService } = require("../dist/services/billing/BillingPackageService.js");
const { prisma } = require("../dist/db/prisma.js");

test("calculateBillingCharge prices tokens per 1M units", () => {
  const charge = calculateBillingCharge({
    usage: {
      promptTokens: 500_000,
      completionTokens: 250_000,
      cacheHitTokens: 125_000,
      totalTokens: 875_000,
    },
    inputPricePerM: 2,
    outputPricePerM: 4,
    cacheHitPricePerM: 1,
  });

  assert.equal(charge.inputCost.toString(), "1");
  assert.equal(charge.outputCost.toString(), "1");
  assert.equal(charge.cacheHitCost.toString(), "0.125");
  assert.equal(charge.totalCost.toString(), "2.125");
});

test("BillingUsageService returns the latest daily usage rows first", async () => {
  const originalFindMany = prisma.billingDailyUsageSummary.findMany;
  let capturedInput = null;
  prisma.billingDailyUsageSummary.findMany = async (input) => {
    capturedInput = input;
    return [
      { dayKey: "2026-05-03", moneySpent: new Prisma.Decimal(3), promptTokens: 12, completionTokens: 22, cacheHitTokens: 5, totalTokens: 39, callCount: 3 },
      { dayKey: "2026-05-02", moneySpent: new Prisma.Decimal(2), promptTokens: 11, completionTokens: 21, cacheHitTokens: 4, totalTokens: 36, callCount: 2 },
    ];
  };

  try {
    const service = new BillingUsageService();
    const rows = await service.listDailyUsage("user-1", 2);
    assert.equal(capturedInput.orderBy[0].dayKey, "desc");
    assert.equal(capturedInput.take, 2);
    assert.deepEqual(rows.map((row) => row.dayKey), ["2026-05-02", "2026-05-03"]);
  } finally {
    prisma.billingDailyUsageSummary.findMany = originalFindMany;
  }
});

test("BillingWalletService settles package quota before wallet balance after daily refresh", async () => {
  const service = new BillingWalletService();
  const originalFindMany = prisma.billingPackageGrant.findMany;
  const originalUpsert = prisma.billingWalletAccount.upsert;
  const originalUpdate = prisma.billingPackageGrant.update;
  const calls = [];

  prisma.billingPackageGrant.findMany = async () => ([
    {
      id: "grant-1",
      userId: "user-1",
      kind: "monthly",
      templateId: "template-1",
      dailyQuotaAmount: new Prisma.Decimal(100),
      dailyRemainingAmount: new Prisma.Decimal(100),
      startsAt: new Date("2026-05-01T00:00:00.000Z"),
      expiresAt: new Date("2026-06-01T00:00:00.000Z"),
      status: "active",
      sourceRedeemCodeId: null,
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    },
  ]);
  prisma.billingWalletAccount.upsert = async ({ create, update }) => ({
    userId: "user-1",
    balanceAmount: new Prisma.Decimal(create.balanceAmount ?? 0),
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...update,
  });
  prisma.billingPackageGrant.update = async (input) => {
    calls.push(input);
    return input;
  };

  const originalTransaction = prisma.$transaction;
  prisma.$transaction = async (callback) => callback({
    billingPackageGrant: {
      findMany: prisma.billingPackageGrant.findMany,
      update: prisma.billingPackageGrant.update,
    },
    billingWalletAccount: {
      upsert: prisma.billingWalletAccount.upsert,
      update: async ({ data }) => data,
    },
  });

  try {
    const result = await service.settleCharge("user-1", new Prisma.Decimal(60), new Date("2026-05-02T01:00:00.000Z"));
    assert.equal(result.packageChargedAmount.toString(), "60");
    assert.equal(result.walletChargedAmount.toString(), "0");
  } finally {
    prisma.billingPackageGrant.findMany = originalFindMany;
    prisma.billingWalletAccount.upsert = originalUpsert;
    prisma.billingPackageGrant.update = originalUpdate;
    prisma.$transaction = originalTransaction;
  }
});

test("BillingPackageService rejects invalid package shapes", async () => {
  const service = new BillingPackageService();
  await assert.rejects(
    () => service.create({
      kind: "balance",
      name: "余额包",
      balanceAmount: 0,
    }),
    /大于 0/,
  );
});

test("BillingRedeemCodeService consumes balance codes into wallet balance", async () => {
  const service = new BillingRedeemCodeService();
  const originalTransaction = prisma.$transaction;
  const originalFindUnique = prisma.billingRedeemCode.findUnique;
  const originalUpsert = prisma.billingWalletAccount.upsert;
  const originalUpdate = prisma.billingRedeemCode.update;
  const originalEnsureWallet = service.walletService.ensureWallet.bind(service.walletService);
  let walletBalance = new Prisma.Decimal(0);

  prisma.billingRedeemCode.findUnique = async () => ({
    id: "redeem-1",
    code: "ABC123",
    kind: "balance",
    status: "unused",
    expiresAt: null,
    template: {
      id: "template-1",
      name: "余额包",
      balanceAmount: new Prisma.Decimal(100),
      dailyQuotaAmount: null,
      durationDays: 0,
    },
  });
  prisma.billingWalletAccount.upsert = async ({ create, update }) => {
    walletBalance = walletBalance.plus(update?.balanceAmount?.increment ?? create.balanceAmount ?? 0);
    return {
      userId: "user-1",
      balanceAmount: walletBalance,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };
  prisma.billingRedeemCode.update = async (input) => input;
  prisma.$transaction = async (callback) => callback({
    billingRedeemCode: {
      findUnique: prisma.billingRedeemCode.findUnique,
      update: prisma.billingRedeemCode.update,
    },
    billingWalletAccount: {
      upsert: prisma.billingWalletAccount.upsert,
    },
  });
  service.walletService.ensureWallet = async () => ({
    userId: "user-1",
    balanceAmount: Number(walletBalance.toString()),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  try {
    await service.consumeCode("user-1", "abc123");
    assert.equal(walletBalance.toString(), "100");
  } finally {
    prisma.$transaction = originalTransaction;
    prisma.billingRedeemCode.findUnique = originalFindUnique;
    prisma.billingWalletAccount.upsert = originalUpsert;
    prisma.billingRedeemCode.update = originalUpdate;
    service.walletService.ensureWallet = originalEnsureWallet;
  }
});
