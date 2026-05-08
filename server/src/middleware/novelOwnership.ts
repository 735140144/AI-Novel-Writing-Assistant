import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma";
import { AppError } from "./errorHandler";

function shouldEnforceOwnedNovel(req: Request): boolean {
  if (process.env.AUTH_TEST_MODE === "strict") {
    return true;
  }
  return req.user?.id != null && req.user.id !== (process.env.AUTH_DEV_USER_ID ?? "dev-admin");
}

export async function requireOwnedNovel(req: Request, _res: Response, next: NextFunction, novelId: string): Promise<void> {
  const trimmedNovelId = novelId.trim();
  if (!trimmedNovelId) {
    next(new AppError("小说不存在。", 404));
    return;
  }

  if (!shouldEnforceOwnedNovel(req)) {
    next();
    return;
  }

  const userId = req.user?.id?.trim();
  if (!userId) {
    next(new AppError("未登录，请先登录。", 401));
    return;
  }

  const ownedNovel = await prisma.novel.findFirst({
    where: {
      id: trimmedNovelId,
      userId,
    },
    select: { id: true },
  });

  if (!ownedNovel) {
    next(new AppError("小说不存在。", 404));
    return;
  }

  next();
}
