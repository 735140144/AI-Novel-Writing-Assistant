import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { BillingModelPriceService } from "../services/billing/BillingModelPriceService";
import { BillingPackageService } from "../services/billing/BillingPackageService";
import { BillingRedeemCodeService } from "../services/billing/BillingRedeemCodeService";
import { BillingUsageService } from "../services/billing/BillingUsageService";
import { BillingWalletService } from "../services/billing/BillingWalletService";

const router = Router();
const priceService = new BillingModelPriceService();
const packageService = new BillingPackageService();
const redeemCodeService = new BillingRedeemCodeService();
const usageService = new BillingUsageService();
const walletService = new BillingWalletService();

const modelPriceSchema = z.object({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  inputPricePerM: z.coerce.number().min(0),
  outputPricePerM: z.coerce.number().min(0),
  cacheHitPricePerM: z.coerce.number().min(0),
  isActive: z.boolean().optional(),
});

const modelPriceBatchSchema = z.object({
  items: z.array(modelPriceSchema).min(1),
});

const packageTemplateSchema = z.object({
  kind: z.enum(["balance", "monthly"]),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  balanceAmount: z.coerce.number().min(0).nullable().optional(),
  dailyQuotaAmount: z.coerce.number().min(0).nullable().optional(),
  durationDays: z.coerce.number().int().min(1).max(365).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

const redeemCodeCreateSchema = z.object({
  templateId: z.string().trim().min(1),
  count: z.coerce.number().int().min(1).max(200),
  expiresAt: z.string().trim().optional(),
});

const redeemCodeStatusSchema = z.object({
  status: z.enum(["unused", "redeemed", "expired", "disabled"]),
});

const walletRedeemSchema = z.object({
  code: z.string().trim().min(1),
});

router.get("/wallet/summary", authMiddleware, async (req, res, next) => {
  try {
    if (!req.user?.id) {
      throw new AppError("未登录，请先登录。", 401);
    }
    const data = await walletService.getSummary(req.user.id);
    res.status(200).json({
      success: true,
      data,
      message: "钱包信息已加载。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/wallet/usage-daily", authMiddleware, async (req, res, next) => {
  try {
    if (!req.user?.id) {
      throw new AppError("未登录，请先登录。", 401);
    }
    const days = Number.parseInt(String(req.query.days ?? "30"), 10);
    const data = await usageService.listDailyUsage(req.user.id, Number.isFinite(days) ? days : 30);
    res.status(200).json({
      success: true,
      data,
      message: "使用记录已加载。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/wallet/redeem-codes", authMiddleware, async (req, res, next) => {
  try {
    if (!req.user?.id) {
      throw new AppError("未登录，请先登录。", 401);
    }
    const data = await redeemCodeService.listUserRedeemedCodes(req.user.id);
    res.status(200).json({
      success: true,
      data,
      message: "兑换记录已加载。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/wallet/redeem-codes/consume",
  authMiddleware,
  validate({ body: walletRedeemSchema }),
  async (req, res, next) => {
    try {
      if (!req.user?.id) {
        throw new AppError("未登录，请先登录。", 401);
      }
      const body = req.body as z.infer<typeof walletRedeemSchema>;
      await redeemCodeService.consumeCode(req.user.id, body.code);
      const data = await walletService.getSummary(req.user.id);
      res.status(200).json({
        success: true,
        data,
        message: "兑换成功，额度已到账。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.use("/settings/billing", authMiddleware, requireAdmin);

router.get("/settings/billing/model-prices", async (_req, res, next) => {
  try {
    const data = await priceService.listAll();
    res.status(200).json({
      success: true,
      data,
      message: "模型价格已加载。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put(
  "/settings/billing/model-prices",
  validate({ body: modelPriceBatchSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof modelPriceBatchSchema>;
      const data = await priceService.upsertMany(body.items);
      res.status(200).json({
        success: true,
        data,
        message: "模型价格已更新。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get("/settings/billing/package-templates", async (_req, res, next) => {
  try {
    const data = await packageService.listAll();
    res.status(200).json({
      success: true,
      data,
      message: "套餐模板已加载。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/settings/billing/package-templates",
  validate({ body: packageTemplateSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof packageTemplateSchema>;
      const data = await packageService.create(body);
      res.status(201).json({
        success: true,
        data,
        message: "套餐模板已创建。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/settings/billing/package-templates/:id",
  validate({
    params: z.object({ id: z.string().trim().min(1) }),
    body: packageTemplateSchema.omit({ kind: true }),
  }),
  async (req, res, next) => {
    try {
      const params = req.params as { id: string };
      const body = req.body as Omit<z.infer<typeof packageTemplateSchema>, "kind">;
      const data = await packageService.update(params.id, body);
      res.status(200).json({
        success: true,
        data,
        message: "套餐模板已更新。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get("/settings/billing/redeem-codes", async (_req, res, next) => {
  try {
    const data = await redeemCodeService.listAll();
    res.status(200).json({
      success: true,
      data,
      message: "兑换码已加载。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/settings/billing/redeem-codes",
  validate({ body: redeemCodeCreateSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof redeemCodeCreateSchema>;
      const data = await redeemCodeService.createMany({
        templateId: body.templateId,
        count: body.count,
        expiresAt: body.expiresAt || null,
        createdByUserId: req.user?.id,
      });
      res.status(201).json({
        success: true,
        data,
        message: "兑换码已生成。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/settings/billing/redeem-codes/:id",
  validate({
    params: z.object({ id: z.string().trim().min(1) }),
    body: redeemCodeStatusSchema,
  }),
  async (req, res, next) => {
    try {
      const params = req.params as { id: string };
      const body = req.body as z.infer<typeof redeemCodeStatusSchema>;
      const data = await redeemCodeService.updateStatus(params.id, body.status);
      res.status(200).json({
        success: true,
        data,
        message: "兑换码状态已更新。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
