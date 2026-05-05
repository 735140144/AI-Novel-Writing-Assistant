import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { authService } from "../services/auth/AuthService";
import { clearSessionCookie, setSessionCookie } from "../services/auth/authCookies";
import { readSessionTokenFromRequest } from "../services/auth/authSession";

const router = Router();

const authCredentialSchema = z.object({
  email: z.string().trim().email("请输入正确的邮箱地址。"),
  password: z.string().trim().min(8, "密码至少需要 8 个字符。"),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email("请输入正确的邮箱地址。"),
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, "重置入口无效，请重新获取。"),
  password: z.string().trim().min(8, "密码至少需要 8 个字符。"),
});

router.post(
  "/register",
  validate({ body: authCredentialSchema }),
  async (req, res, next) => {
    try {
      const user = await authService.register(req.body as z.infer<typeof authCredentialSchema>);
      res.status(201).json({
        success: true,
        data: user,
        message: "注册成功，请前往邮箱完成验证。",
      } satisfies ApiResponse<typeof user>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/login",
  validate({ body: authCredentialSchema }),
  async (req, res, next) => {
    try {
      const result = await authService.login({
        ...(req.body as z.infer<typeof authCredentialSchema>),
        ip: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
      });
      setSessionCookie(res, result.session.token, result.session.expiresAt);
      res.status(200).json({
        success: true,
        data: result.user,
        message: "登录成功。",
      } satisfies ApiResponse<typeof result.user>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/forgot-password",
  validate({ body: forgotPasswordSchema }),
  async (req, res, next) => {
    try {
      await authService.forgotPassword({
        email: (req.body as z.infer<typeof forgotPasswordSchema>).email,
        requestOrigin: `${req.protocol}://${req.get("host")}`,
      });
      res.status(200).json({
        success: true,
        data: null,
        message: "如果该邮箱已注册，我们会把重置入口发送到你的邮箱。",
      } satisfies ApiResponse<null>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/reset-password",
  validate({ body: resetPasswordSchema }),
  async (req, res, next) => {
    try {
      await authService.resetPassword(req.body as z.infer<typeof resetPasswordSchema>);
      res.status(200).json({
        success: true,
        data: null,
        message: "密码已重置，请使用新密码登录。",
      } satisfies ApiResponse<null>);
    } catch (error) {
      next(error);
    }
  },
);

router.get("/me", authMiddleware, (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError("未登录，请先登录。", 401);
    }
    res.status(200).json({
      success: true,
      data: req.user,
      message: "已获取当前账号信息。",
    } satisfies ApiResponse<typeof req.user>);
  } catch (error) {
    next(error);
  }
});

router.post("/logout", authMiddleware, async (req, res, next) => {
  try {
    await authService.logout(readSessionTokenFromRequest(req));
    clearSessionCookie(res);
    res.status(200).json({
      success: true,
      data: null,
      message: "已退出登录。",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

export default router;
