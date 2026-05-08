import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma";
import { AppError } from "./errorHandler";

function shouldEnforceOwnedWorld(req: Request): boolean {
  if (process.env.AUTH_TEST_MODE === "strict") {
    return true;
  }
  return req.user?.id != null && req.user.id !== (process.env.AUTH_DEV_USER_ID ?? "dev-admin");
}

export async function requireOwnedWorld(req: Request, _res: Response, next: NextFunction, worldId: string): Promise<void> {
  const trimmedWorldId = worldId.trim();
  if (!trimmedWorldId) {
    next(new AppError("世界观不存在。", 404));
    return;
  }

  if (!shouldEnforceOwnedWorld(req)) {
    next();
    return;
  }

  const userId = req.user?.id?.trim();
  if (!userId) {
    next(new AppError("未登录，请先登录。", 401));
    return;
  }

  const ownedWorld = await prisma.world.findFirst({
    where: {
      id: trimmedWorldId,
      userId,
    },
    select: { id: true },
  });

  if (!ownedWorld) {
    next(new AppError("世界观不存在。", 404));
    return;
  }

  next();
}
