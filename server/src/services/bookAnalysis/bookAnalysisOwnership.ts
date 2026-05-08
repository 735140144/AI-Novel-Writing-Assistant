import type { Prisma } from "@prisma/client";
import { AppError } from "../../middleware/errorHandler";
import { getRequestContext } from "../../runtime/requestContext";

export function requireCurrentBookAnalysisUserId(): string {
  const userId = getRequestContext()?.userId?.trim();
  if (!userId) {
    throw new AppError("未登录，请先登录。", 401);
  }
  return userId;
}

export function getOwnedBookAnalysisScope():
  | { enforce: true; userId: string }
  | { enforce: false; userId: null } {
  const context = getRequestContext();
  const userId = context?.userId?.trim();
  if (context?.authMode === "session" && userId) {
    return { enforce: true, userId };
  }
  return { enforce: false, userId: null };
}

export function buildOwnedBookAnalysisWhere(analysisId: string): Prisma.BookAnalysisWhereInput {
  const scope = getOwnedBookAnalysisScope();
  if (scope.enforce) {
    return { id: analysisId, userId: scope.userId };
  }
  return { id: analysisId };
}

export function applyOwnedBookAnalysisWhere(
  where: Prisma.BookAnalysisWhereInput = {},
): Prisma.BookAnalysisWhereInput {
  const scope = getOwnedBookAnalysisScope();
  if (scope.enforce) {
    return {
      ...where,
      userId: scope.userId,
    };
  }
  return where;
}

export function buildOwnedBookAnalysisSectionWhere(input: {
  analysisId: string;
  sectionKey?: string;
}): Prisma.BookAnalysisSectionWhereInput {
  const baseWhere: Prisma.BookAnalysisSectionWhereInput = {
    analysisId: input.analysisId,
    ...(input.sectionKey ? { sectionKey: input.sectionKey } : {}),
  };
  const scope = getOwnedBookAnalysisScope();
  if (scope.enforce) {
    return {
      ...baseWhere,
      analysis: {
        userId: scope.userId,
      },
    };
  }
  return baseWhere;
}
