import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { getRequestContext } from "../../runtime/requestContext";

export const TASK_OWNER_ADMIN_EMAIL = "caoty@luckydcms.com";

export function requireCurrentTaskUserId(): string {
  const userId = getRequestContext()?.userId?.trim();
  if (!userId) {
    throw new AppError("未登录，请先登录。", 401);
  }
  return userId;
}

export function getOwnedTaskScope():
  | { enforce: true; userId: string }
  | { enforce: false; userId: null } {
  const context = getRequestContext();
  const userId = context?.userId?.trim();
  if (context?.authMode === "session" && userId) {
    return { enforce: true, userId };
  }
  return { enforce: false, userId: null };
}

export function getCurrentTaskUserId(): string | null {
  const scope = getOwnedTaskScope();
  return scope.enforce ? scope.userId : null;
}

export function buildOwnedAgentRunWhere(id: string): Prisma.AgentRunWhereInput {
  const scope = getOwnedTaskScope();
  if (scope.enforce) {
    return { id, userId: scope.userId };
  }
  return { id };
}

export function applyOwnedAgentRunWhere(
  where: Prisma.AgentRunWhereInput = {},
): Prisma.AgentRunWhereInput {
  const scope = getOwnedTaskScope();
  if (scope.enforce) {
    return {
      ...where,
      userId: scope.userId,
    };
  }
  return where;
}

export function buildOwnedGenerationJobWhere(id: string): Prisma.GenerationJobWhereInput {
  const scope = getOwnedTaskScope();
  if (scope.enforce) {
    return { id, userId: scope.userId };
  }
  return { id };
}

export function applyOwnedGenerationJobWhere(
  where: Prisma.GenerationJobWhereInput = {},
): Prisma.GenerationJobWhereInput {
  const scope = getOwnedTaskScope();
  if (scope.enforce) {
    return {
      ...where,
      userId: scope.userId,
    };
  }
  return where;
}

export function buildOwnedNovelWorkflowTaskWhere(id: string): Prisma.NovelWorkflowTaskWhereInput {
  const scope = getOwnedTaskScope();
  if (scope.enforce) {
    return { id, userId: scope.userId };
  }
  return { id };
}

export function applyOwnedNovelWorkflowTaskWhere(
  where: Prisma.NovelWorkflowTaskWhereInput = {},
): Prisma.NovelWorkflowTaskWhereInput {
  const scope = getOwnedTaskScope();
  if (scope.enforce) {
    return {
      ...where,
      userId: scope.userId,
    };
  }
  return where;
}

export function buildOwnedCreativeHubThreadWhere(id: string): Prisma.CreativeHubThreadWhereInput {
  const scope = getOwnedTaskScope();
  if (scope.enforce) {
    return { id, userId: scope.userId };
  }
  return { id };
}

export function applyOwnedCreativeHubThreadWhere(
  where: Prisma.CreativeHubThreadWhereInput = {},
): Prisma.CreativeHubThreadWhereInput {
  const scope = getOwnedTaskScope();
  if (scope.enforce) {
    return {
      ...where,
      userId: scope.userId,
    };
  }
  return where;
}

export async function resolveOwnedTaskUserId(input: {
  novelId?: string | null;
  fallbackToAdmin?: boolean;
} = {}): Promise<string | null> {
  const scopedUserId = getCurrentTaskUserId();
  if (scopedUserId) {
    return scopedUserId;
  }

  const novelId = input.novelId?.trim();
  if (novelId) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { userId: true },
    });
    const novelUserId = novel?.userId?.trim();
    if (novelUserId) {
      return novelUserId;
    }
  }

  if (!input.fallbackToAdmin) {
    return null;
  }

  const admin = await prisma.user.findUnique({
    where: { email: TASK_OWNER_ADMIN_EMAIL },
    select: { id: true },
  });
  return admin?.id ?? null;
}
