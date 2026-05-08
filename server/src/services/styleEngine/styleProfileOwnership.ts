import type { Prisma } from "@prisma/client";
import { AppError } from "../../middleware/errorHandler";
import { getRequestContext } from "../../runtime/requestContext";

export function requireCurrentStyleProfileUserId(): string {
  const userId = getRequestContext()?.userId?.trim();
  if (!userId) {
    throw new AppError("未登录，请先登录。", 401);
  }
  return userId;
}

export function getOwnedStyleProfileScope():
  | { enforce: true; userId: string }
  | { enforce: false; userId: null } {
  const context = getRequestContext();
  const userId = context?.userId?.trim();
  if (context?.authMode === "session" && userId) {
    return { enforce: true, userId };
  }
  return { enforce: false, userId: null };
}

export function buildOwnedStyleProfileWhere(id: string): Prisma.StyleProfileWhereInput {
  const scope = getOwnedStyleProfileScope();
  if (scope.enforce) {
    return { id, userId: scope.userId };
  }
  return { id };
}

export function applyOwnedStyleProfileWhere(
  where: Prisma.StyleProfileWhereInput = {},
): Prisma.StyleProfileWhereInput {
  const scope = getOwnedStyleProfileScope();
  if (scope.enforce) {
    return {
      ...where,
      userId: scope.userId,
    };
  }
  return where;
}
