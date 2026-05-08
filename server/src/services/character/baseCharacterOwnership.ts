import type { Prisma } from "@prisma/client";
import { AppError } from "../../middleware/errorHandler";
import { getRequestContext } from "../../runtime/requestContext";

export function requireCurrentBaseCharacterUserId(): string {
  const userId = getRequestContext()?.userId?.trim();
  if (!userId) {
    throw new AppError("未登录，请先登录。", 401);
  }
  return userId;
}

export function getOwnedBaseCharacterScope():
  | { enforce: true; userId: string }
  | { enforce: false; userId: null } {
  const context = getRequestContext();
  const userId = context?.userId?.trim();
  if (context?.authMode === "session" && userId) {
    return { enforce: true, userId };
  }
  return { enforce: false, userId: null };
}

export function buildOwnedBaseCharacterWhere(id: string): Prisma.BaseCharacterWhereInput {
  const scope = getOwnedBaseCharacterScope();
  if (scope.enforce) {
    return { id, userId: scope.userId };
  }
  return { id };
}

export function applyOwnedBaseCharacterWhere(
  where: Prisma.BaseCharacterWhereInput = {},
): Prisma.BaseCharacterWhereInput {
  const scope = getOwnedBaseCharacterScope();
  if (scope.enforce) {
    return {
      ...where,
      userId: scope.userId,
    };
  }
  return where;
}
