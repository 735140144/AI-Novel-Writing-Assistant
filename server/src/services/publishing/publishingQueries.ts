import { PublishItemStatus, PublishingPlatform } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { getRequestContext } from "../../runtime/requestContext";
import { buildKnownBookOptionsFromWorkspace } from "./publishingKnownBooks";
import { parseDate, resolvePlanStatusFromItemStatuses, type PrismaLike } from "./publishingCore";

export function requireCurrentUserId(): string {
  const userId = getRequestContext()?.userId?.trim();
  if (!userId) {
    throw new AppError("未登录，请先登录。", 401);
  }
  return userId;
}

function buildOwnedNovelWhere(novelId: string, userId: string) {
  if (getRequestContext()?.authMode === "session") {
    return { id: novelId, userId };
  }
  return { id: novelId };
}

export async function ensureNovel(novelId: string, userId: string) {
  const novel = await prisma.novel.findFirst({
    where: buildOwnedNovelWhere(novelId, userId),
    select: { id: true, title: true, userId: true },
  });
  if (!novel) {
    throw new AppError("小说不存在。", 404);
  }
  return novel;
}

export async function getOwnedCredential(credentialId: string, userId: string, db: PrismaLike = prisma) {
  const credential = await db.publishingPlatformCredential.findFirst({
    where: {
      id: credentialId,
      userId,
    },
  });
  if (!credential) {
    throw new AppError("发布平台账号不存在。", 404);
  }
  return credential;
}

export async function getOwnedBinding(
  novelId: string,
  bindingId: string,
  userId: string,
  db: PrismaLike = prisma,
) {
  await ensureNovel(novelId, userId);
  const binding = await db.novelPlatformBinding.findFirst({
    where: {
      id: bindingId,
      novelId,
      credential: {
        userId,
      },
    },
    include: {
      credential: true,
    },
  });
  if (!binding) {
    throw new AppError("小说发布绑定不存在。", 404);
  }
  return binding;
}

export async function getActiveBinding(novelId: string, userId: string, db: PrismaLike = prisma) {
  await ensureNovel(novelId, userId);
  const binding = await db.novelPlatformBinding.findFirst({
    where: {
      novelId,
      platform: PublishingPlatform.fanqie,
      credential: {
        userId,
      },
    },
    include: { credential: true },
  });
  if (!binding) {
    throw new AppError("请先绑定番茄书籍。", 400);
  }
  return binding;
}

export async function listVolumeTitlesByChapterOrder(novelId: string): Promise<Map<number, string>> {
  const volumes = await prisma.volumePlan.findMany({
    where: {
      novelId,
      status: "active",
    },
    select: {
      title: true,
      chapters: {
        select: {
          chapterOrder: true,
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }],
  });
  const volumeTitleByChapterOrder = new Map<number, string>();
  for (const volume of volumes) {
    const title = volume.title.trim();
    if (!title) {
      continue;
    }
    for (const chapter of volume.chapters) {
      if (!volumeTitleByChapterOrder.has(chapter.chapterOrder)) {
        volumeTitleByChapterOrder.set(chapter.chapterOrder, title);
      }
    }
  }
  return volumeTitleByChapterOrder;
}

export async function updatePlanStatusFromItems(db: PrismaLike, planId: string): Promise<void> {
  const items = await db.publishPlanItem.findMany({
    where: { planId },
    select: { status: true },
  });
  await db.publishPlan.update({
    where: { id: planId },
    data: {
      status: resolvePlanStatusFromItemStatuses(items.map((item) => item.status)),
    },
  });
}

export async function listKnownBooks(userId: string) {
  const [bindings, jobs] = await Promise.all([
    prisma.novelPlatformBinding.findMany({
      where: {
        credential: {
          userId,
        },
      },
      include: {
        credential: {
          select: {
            id: true,
            label: true,
          },
        },
        novel: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.publishDispatchJob.findMany({
      where: {
        binding: {
          credential: {
            userId,
          },
        },
      },
      select: {
        credentialId: true,
        bookId: true,
        bookTitle: true,
        submittedAt: true,
      },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
  ]);

  return buildKnownBookOptionsFromWorkspace({
    bindings,
    jobs,
  });
}

export async function resolveScheduleContinuation(input: {
  novelId: string;
  bindingId: string;
}) {
  const completedStatuses = [PublishItemStatus.draft_box, PublishItemStatus.published];
  const occupiedItems = await prisma.publishPlanItem.findMany({
    where: {
      novelId: input.novelId,
      bindingId: input.bindingId,
      status: {
        in: completedStatuses,
      },
    },
    select: {
      chapterId: true,
      plannedPublishTime: true,
    },
    orderBy: [{ plannedPublishTime: "asc" }, { chapterOrder: "asc" }],
  });
  let occupiedCount = occupiedItems.length;
  const skipChapterIds = new Set(occupiedItems.map((item) => item.chapterId));
  const lastOccupiedTime = occupiedItems.length > 0
    ? occupiedItems[occupiedItems.length - 1].plannedPublishTime
    : null;

  const activePlannedItems = await prisma.publishPlanItem.findMany({
    where: {
      novelId: input.novelId,
      bindingId: input.bindingId,
      status: {
        notIn: completedStatuses,
      },
    },
    select: {
      chapterId: true,
      plannedPublishTime: true,
    },
    orderBy: [{ plannedPublishTime: "asc" }, { chapterOrder: "asc" }],
  });
  for (const item of activePlannedItems) {
    skipChapterIds.add(item.chapterId);
  }
  occupiedCount += activePlannedItems.length;
  const latestPlannedTime = activePlannedItems.length > 0
    ? activePlannedItems[activePlannedItems.length - 1].plannedPublishTime
    : null;

  return {
    skipChapterIds,
    occupiedCount,
    occupiedPlannedTime: latestPlannedTime ?? lastOccupiedTime,
  };
}

export async function upsertCredentialFromDispatch(input: {
  userId: string;
  label: string;
  credentialUuid: string;
  status: "created" | "login_pending" | "ready" | "expired" | "invalid";
  lastValidatedAt?: string;
  account?: {
    accountId?: string;
    accountDisplayName?: string;
  };
}) {
  return prisma.publishingPlatformCredential.upsert({
    where: {
      userId_platform_credentialUuid: {
        userId: input.userId,
        platform: PublishingPlatform.fanqie,
        credentialUuid: input.credentialUuid,
      },
    },
    create: {
      userId: input.userId,
      platform: PublishingPlatform.fanqie,
      label: input.label,
      credentialUuid: input.credentialUuid,
      status: input.status,
      lastValidatedAt: parseDate(input.lastValidatedAt),
      accountId: input.account?.accountId ?? null,
      accountDisplayName: input.account?.accountDisplayName ?? null,
    },
    update: {
      label: input.label,
      status: input.status,
      lastValidatedAt: parseDate(input.lastValidatedAt),
      accountId: input.account?.accountId ?? null,
      accountDisplayName: input.account?.accountDisplayName ?? null,
    },
  });
}
