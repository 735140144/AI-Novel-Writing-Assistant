import type { NextFunction, Request, Response } from "express";
import { AppError } from "./errorHandler";
import { readSessionTokenFromRequest, resolveAuthenticatedUser } from "../services/auth/authSession";
import { runWithRequestContext } from "../runtime/requestContext";

function resolveDevBypassUser() {
  return {
    id: process.env.AUTH_DEV_USER_ID ?? "dev-admin",
    email: process.env.AUTH_DEV_USER_EMAIL ?? "caoty@luckydcms.com",
    role: "admin",
    status: "active",
    emailVerifiedAt: new Date().toISOString(),
  };
}

function shouldAllowDevBypass(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return process.env.AUTH_DEV_BYPASS !== "false";
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (process.env.AUTH_TEST_MODE === "strict") {
    const token = readSessionTokenFromRequest(req);
    if (!token) {
      next(new AppError("未登录，请先登录。", 401));
      return;
    }
    const user = await resolveAuthenticatedUser(token);
    if (!user) {
      next(new AppError("未登录，请先登录。", 401));
      return;
    }
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    };
    runWithRequestContext({ userId: user.id, authMode: "session" }, next);
    return;
  }

  const token = readSessionTokenFromRequest(req);
  if (token) {
    const user = await resolveAuthenticatedUser(token);
    if (user) {
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      };
      runWithRequestContext({ userId: user.id, authMode: "session" }, next);
      return;
    }
  }

  if (shouldAllowDevBypass()) {
    req.user = resolveDevBypassUser();
    runWithRequestContext({ userId: req.user.id, authMode: "dev_bypass" }, next);
    return;
  }

  next(new AppError("未登录，请先登录。", 401));
}
