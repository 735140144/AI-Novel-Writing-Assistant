import type {
  GeneratePublishPlanRequest,
  PublishMode,
  PublishingBindingRemoteProgress,
  PublishingWorkDetailResponse,
  SubmitPublishPlanRequest,
  UpsertNovelPlatformBindingRequest,
} from "@ai-novel/shared/types/publishing";
import {
  NovelPlatformBindingStatus,
  PublishDispatchJobStatus,
  PublishItemStatus,
  PublishPlanStatus,
  PublishingCredentialStatus,
  PublishingPlatform,
} from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { FanqieDispatchApiError, FanqieDispatchClient } from "./FanqieDispatchClient";
import { resolveCredentialChallengeForStatus, resolveCredentialLabel } from "./publishingCredentialState";
import {
  normalizeMode,
  normalizePlatform,
  safeJsonStringify,
  sanitizeChallengeForClient,
  stringifyError,
  type PrismaLike,
} from "./publishingCore";
import { parseScheduleInstruction } from "./publishingPlanGeneration";
import {
  buildPublishingWorkListItems,
  ensureNovel,
  getActiveBinding,
  getOwnedBinding,
  getOwnedCredential,
  listKnownBooks,
  listOwnedBindings,
  listVolumeTitlesByChapterOrder,
  requireCurrentUserId,
  resolveScheduleContinuation,
  updatePlanStatusFromItems,
  upsertCredentialFromDispatch,
} from "./publishingQueries";
import {
  createPublishingRemoteProgressSnapshot,
  getEffectiveRemoteProgressRows,
  parsePublishingRemoteProgressSnapshot,
} from "./publishingRemoteProgress";
import {
  buildChapterPublishScheduleFromOffset,
  continueScheduleAfterTime,
  groupPublishPlanItemsByPlannedTime,
  resolveContinuationStartIndexOffset,
} from "./publishingSchedule";
import {
  mapDispatchJobStatusToItemStatus,
  resolveDispatchErrorHttpStatus,
  resolveDispatchErrorItemStatus,
} from "./publishingStatus";
import {
  mapCredentialLoginResponse,
  mapNovelPlatformBinding,
  mapPublishDispatchJob,
  mapPublishingCredential,
  mapPublishPlan,
} from "./publishingMappers";

export class PublishingService {
  constructor(private readonly dispatchClient = new FanqieDispatchClient()) {}

  async listCredentials() {
    const userId = requireCurrentUserId();
    const [rows, knownBooks] = await Promise.all([
      prisma.publishingPlatformCredential.findMany({
        where: { userId },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
      listKnownBooks(userId),
    ]);
    return {
      credentials: rows.map(mapPublishingCredential),
      knownBooks,
    };
  }

  async listWorks() {
    const userId = requireCurrentUserId();
    const rows = await listOwnedBindings(userId);
    return {
      items: buildPublishingWorkListItems(rows),
    };
  }

  async createCredential(input: {
    platform?: string;
    label: string;
    credentialUuid?: string;
  }) {
    const userId = requireCurrentUserId();
    const platform = normalizePlatform(input.platform);
    const label = input.label.trim();
    if (!label) {
      throw new AppError("请填写账号标签。", 400);
    }

    if (input.credentialUuid?.trim()) {
      const credentialUuid = input.credentialUuid.trim();
      const existingCredential = await prisma.publishingPlatformCredential.findUnique({
        where: {
          platform_credentialUuid: {
            platform,
            credentialUuid,
          },
        },
        select: {
          userId: true,
        },
      });
      if (existingCredential && existingCredential.userId !== userId) {
        throw new AppError("该发布账号已绑定到其他登录用户。", 409);
      }
      const row = await prisma.publishingPlatformCredential.upsert({
        where: {
          userId_platform_credentialUuid: {
            userId,
            platform,
            credentialUuid,
          },
        },
        create: {
          userId,
          platform,
          label,
          credentialUuid,
          status: PublishingCredentialStatus.created,
        },
        update: {
          label,
        },
      });
      return mapPublishingCredential(row);
    }

    const dispatchCredential = await this.dispatchClient.createCredential(label);
    const row = await upsertCredentialFromDispatch({
      userId,
      label: dispatchCredential.label ?? label,
      credentialUuid: dispatchCredential.uuid,
      status: dispatchCredential.status,
      lastValidatedAt: dispatchCredential.lastValidatedAt,
      account: dispatchCredential.account,
    });
    return mapPublishingCredential(row);
  }

  async bootstrapCredentialLogin(credentialId: string, mode: "create" | "refresh" = "create") {
    const userId = requireCurrentUserId();
    const credential = await getOwnedCredential(credentialId, userId);
    const response = await this.dispatchClient.bootstrapLogin({
      credentialUuid: credential.credentialUuid,
      mode,
    });
    const challenge = sanitizeChallengeForClient(response.challenge);

    const updated = await prisma.publishingPlatformCredential.update({
      where: { id: credential.id },
      data: {
        status: response.credential.status,
        accountId: response.credential.account?.accountId ?? credential.accountId,
        accountDisplayName: response.credential.account?.accountDisplayName ?? credential.accountDisplayName,
        lastLoginChallengeId: challenge?.id ?? credential.lastLoginChallengeId,
        lastLoginChallengeStatus: challenge?.status ?? credential.lastLoginChallengeStatus,
        lastLoginChallengeJson: challenge ? safeJsonStringify(challenge) : credential.lastLoginChallengeJson,
      },
    });

    return mapCredentialLoginResponse({
      credential: updated,
      challenge,
    });
  }

  async validateCredential(credentialId: string, challengeId?: string) {
    const userId = requireCurrentUserId();
    const credential = await getOwnedCredential(credentialId, userId);
    const response = await this.dispatchClient.validateCredential({
      credentialUuid: credential.credentialUuid,
      challengeId: (challengeId?.trim() || credential.lastLoginChallengeId) ?? undefined,
    });
    const challenge = sanitizeChallengeForClient(response.challenge);

    const updated = await prisma.publishingPlatformCredential.update({
      where: { id: credential.id },
      data: {
        status: response.credential.status,
        label: resolveCredentialLabel({
          currentLabel: credential.label,
          accountDisplayName: response.credential.account?.accountDisplayName,
          status: response.credential.status,
        }),
        accountId: response.credential.account?.accountId ?? null,
        accountDisplayName: response.credential.account?.accountDisplayName ?? null,
        lastValidatedAt: new Date(),
        lastLoginChallengeId: resolveCredentialChallengeForStatus({
          status: response.credential.status,
          challenge,
        }) === null
          ? null
          : challenge?.id ?? credential.lastLoginChallengeId,
        lastLoginChallengeStatus: resolveCredentialChallengeForStatus({
          status: response.credential.status,
          challenge,
        }) === null
          ? null
          : challenge?.status ?? credential.lastLoginChallengeStatus,
        lastLoginChallengeJson: resolveCredentialChallengeForStatus({
          status: response.credential.status,
          challenge,
        }) === null
          ? null
          : challenge ? safeJsonStringify(challenge) : credential.lastLoginChallengeJson,
      },
    });

    return mapCredentialLoginResponse({
      credential: updated,
      challenge,
    });
  }

  async upsertNovelBinding(novelId: string, input: UpsertNovelPlatformBindingRequest) {
    const userId = requireCurrentUserId();
    await ensureNovel(novelId, userId);
    const platform = normalizePlatform(input.platform);
    const credential = await getOwnedCredential(input.credentialId, userId);
    const bookId = input.bookId.trim();
    const bookTitle = input.bookTitle.trim();
    if (!bookId || !bookTitle) {
      throw new AppError("请填写平台书籍 ID 和书名。", 400);
    }

    const existing = await prisma.novelPlatformBinding.findFirst({
      where: {
        novelId,
        credentialId: credential.id,
        platform,
      },
      select: { id: true },
    });

    const row = existing
      ? await prisma.novelPlatformBinding.update({
          where: { id: existing.id },
          data: {
            bookId,
            bookTitle,
            status: NovelPlatformBindingStatus.active,
          },
          include: {
            credential: {
              select: {
                label: true,
                status: true,
                accountDisplayName: true,
              },
            },
          },
        })
      : await prisma.novelPlatformBinding.create({
          data: {
            novelId,
            platform,
            credentialId: credential.id,
            bookId,
            bookTitle,
            status: NovelPlatformBindingStatus.active,
          },
          include: {
            credential: {
              select: {
                label: true,
                status: true,
                accountDisplayName: true,
              },
            },
          },
        });

    return mapNovelPlatformBinding(row);
  }

  async getWorkDetail(bindingId: string): Promise<PublishingWorkDetailResponse> {
    const userId = requireCurrentUserId();
    const binding = await prisma.novelPlatformBinding.findFirst({
      where: {
        id: bindingId,
        credential: { userId },
      },
      include: {
        credential: {
          select: {
            id: true,
            label: true,
            status: true,
            credentialUuid: true,
            accountDisplayName: true,
            accountId: true,
            lastValidatedAt: true,
            lastLoginChallengeId: true,
            lastLoginChallengeStatus: true,
            lastLoginChallengeJson: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        novel: {
          include: {
            chapters: {
              select: {
                id: true,
                generationState: true,
                chapterStatus: true,
              },
            },
          },
        },
      },
    });
    if (!binding) {
      throw new AppError("小说发布绑定不存在。", 404);
    }

    const [credentials, knownBooks, activePlan, recentJobs] = await Promise.all([
      prisma.publishingPlatformCredential.findMany({
        where: { userId },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
      listKnownBooks(userId),
      prisma.publishPlan.findFirst({
        where: {
          bindingId: binding.id,
        },
        include: {
          items: {
            orderBy: [{ chapterOrder: "asc" }],
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.publishDispatchJob.findMany({
        where: {
          bindingId: binding.id,
        },
        orderBy: [{ createdAt: "desc" }],
        take: 10,
      }),
    ]);

    const completedChapterCount = binding.novel.chapters.filter((chapter) =>
      chapter.chapterStatus === "completed"
      || chapter.generationState === "approved"
      || chapter.generationState === "published").length;

    return {
      binding: mapNovelPlatformBinding(binding),
      novel: {
        id: binding.novel.id,
        title: binding.novel.title,
        description: binding.novel.description,
        estimatedChapterCount: binding.novel.estimatedChapterCount,
        completedChapterCount,
        chapterCount: binding.novel.chapters.length,
      },
      credentials: credentials.map(mapPublishingCredential),
      knownBooks,
      activePlan: activePlan ? mapPublishPlan(activePlan) : null,
      recentJobs: recentJobs.map(mapPublishDispatchJob),
      remoteProgress: parsePublishingRemoteProgressSnapshot(binding.remoteProgressSnapshotJson),
    };
  }

  private async reconcileBindingProgress(input: {
    bindingId: string;
    progress: PublishingBindingRemoteProgress;
  }): Promise<void> {
    const effective = getEffectiveRemoteProgressRows(input.progress);
    const planItems = await prisma.publishPlanItem.findMany({
      where: { bindingId: input.bindingId },
      select: {
        id: true,
        planId: true,
        chapterOrder: true,
        chapterTitle: true,
        status: true,
      },
    });

    const touchedPlanIds = new Set<string>();
    for (const item of planItems) {
      const chapterNames = [item.chapterTitle.trim()];
      let nextStatus: PublishItemStatus | null = null;

      if (
        effective.publishedOrders.has(item.chapterOrder)
        || chapterNames.some((name) => name && effective.publishedNames.has(name))
      ) {
        nextStatus = PublishItemStatus.published;
      } else if (
        effective.effectiveDraftOrders.has(item.chapterOrder)
        || chapterNames.some((name) => name && effective.effectiveDraftNames.has(name))
      ) {
        nextStatus = PublishItemStatus.draft_box;
      }

      if (!nextStatus || nextStatus === item.status) {
        continue;
      }

      touchedPlanIds.add(item.planId);
      await prisma.publishPlanItem.update({
        where: { id: item.id },
        data: {
          status: nextStatus,
          lastError: null,
          publishedAt: nextStatus === PublishItemStatus.published ? new Date() : item.status === PublishItemStatus.published ? undefined : null,
        },
      });
    }

    for (const planId of touchedPlanIds) {
      await updatePlanStatusFromItems(prisma, planId);
    }
  }

  async syncBindingProgress(bindingId: string): Promise<PublishingBindingRemoteProgress> {
    const userId = requireCurrentUserId();
    const binding = await prisma.novelPlatformBinding.findFirst({
      where: {
        id: bindingId,
        credential: { userId },
      },
      include: {
        credential: true,
      },
    });
    if (!binding) {
      throw new AppError("小说发布绑定不存在。", 404);
    }

    let progress;
    try {
      progress = await this.dispatchClient.getBookProgress({
        credentialUuid: binding.credential.credentialUuid,
        bookId: binding.bookId,
        bookTitle: binding.bookTitle,
      });
    } catch (error) {
      if (error instanceof FanqieDispatchApiError) {
        if (resolveDispatchErrorItemStatus(error.payload) === "relogin_required") {
          await prisma.publishingPlatformCredential.update({
            where: { id: binding.credential.id },
            data: { status: PublishingCredentialStatus.expired },
          });
          throw new AppError(
            "当前发布账号需要重新扫码后才能同步远端进度。请前往账号管理重新扫码后重试。",
            resolveDispatchErrorHttpStatus({
              upstreamStatus: error.status,
              value: error.payload,
            }),
            error.payload,
          );
        }
        throw new AppError(
          error.message,
          resolveDispatchErrorHttpStatus({
            upstreamStatus: error.status,
            value: error.payload,
          }),
          error.payload,
        );
      }
      throw error;
    }
    const syncedAt = new Date().toISOString();
    const snapshot = createPublishingRemoteProgressSnapshot(progress, syncedAt);

    await prisma.novelPlatformBinding.update({
      where: { id: binding.id },
      data: {
        lastValidatedAt: new Date(),
        remoteProgressSnapshotJson: safeJsonStringify(snapshot),
      },
    });
    await this.reconcileBindingProgress({
      bindingId: binding.id,
      progress: snapshot,
    });

    return snapshot;
  }

  async getWorkspace(novelId: string) {
    const userId = requireCurrentUserId();
    await ensureNovel(novelId, userId);
    const [credentials, knownBooks, binding, activePlan, recentJobs] = await Promise.all([
      prisma.publishingPlatformCredential.findMany({
        where: { userId },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
      listKnownBooks(userId),
      prisma.novelPlatformBinding.findFirst({
        where: {
          novelId,
          platform: PublishingPlatform.fanqie,
          credential: { userId },
        },
        include: {
          credential: {
            select: {
              label: true,
              status: true,
            },
          },
        },
      }),
      prisma.publishPlan.findFirst({
        where: {
          novelId,
          binding: {
            credential: { userId },
          },
        },
        include: {
          items: {
            orderBy: [{ chapterOrder: "asc" }],
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.publishDispatchJob.findMany({
        where: {
          novelId,
          binding: {
            credential: { userId },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        take: 10,
      }),
    ]);

    return {
      credentials: credentials.map(mapPublishingCredential),
      knownBooks,
      binding: binding ? mapNovelPlatformBinding(binding) : null,
      activePlan: activePlan ? mapPublishPlan(activePlan) : null,
      recentJobs: recentJobs.map(mapPublishDispatchJob),
    };
  }

  async generatePlanForBinding(bindingId: string, request: GeneratePublishPlanRequest) {
    const userId = requireCurrentUserId();
    const binding = await prisma.novelPlatformBinding.findFirst({
      where: {
        id: bindingId,
        credential: { userId },
      },
      select: {
        id: true,
        novelId: true,
      },
    });
    if (!binding) {
      throw new AppError("小说发布绑定不存在。", 404);
    }
    return this.generatePlan(binding.novelId, {
      ...request,
      bindingId: binding.id,
    });
  }

  async generatePlan(novelId: string, request: GeneratePublishPlanRequest) {
    const userId = requireCurrentUserId();
    await ensureNovel(novelId, userId);
    const binding = request.bindingId
      ? await getOwnedBinding(novelId, request.bindingId, userId)
      : await getActiveBinding(novelId, userId);
    const instruction = request.instruction.trim();
    if (!instruction) {
      throw new AppError("请填写发布节奏。", 400);
    }
    const remoteProgressSnapshot = parsePublishingRemoteProgressSnapshot(binding.remoteProgressSnapshotJson);
    if (!remoteProgressSnapshot) {
      throw new AppError("首次生成发布时间表前，请先同步远端进度。", 400);
    }

    const [chapters, volumeTitleByChapterOrder] = await Promise.all([
      prisma.chapter.findMany({
        where: {
          novelId,
          OR: [
            { chapterStatus: "completed" },
            { generationState: "approved" },
            { generationState: "published" },
          ],
        },
        select: {
          id: true,
          order: true,
          title: true,
        },
        orderBy: [{ order: "asc" }],
      }),
      listVolumeTitlesByChapterOrder(novelId),
    ]);
    if (chapters.length === 0) {
      throw new AppError("当前小说还没有可发布章节。", 400);
    }

    let structured;
    let resolved;
    try {
      ({ structured, resolved } = await parseScheduleInstruction({
        novelId,
        instruction,
        chapters,
        request,
      }));
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        error instanceof Error && error.message.trim() ? error.message : "发布时间表生成失败。",
        400,
      );
    }
    const continuation = await resolveScheduleContinuation({
      novelId,
      bindingId: binding.id,
    });
    const remoteEffective = getEffectiveRemoteProgressRows(remoteProgressSnapshot);
    for (const chapter of chapters) {
      if (remoteEffective.publishedOrders.has(chapter.order) || remoteEffective.effectiveDraftOrders.has(chapter.order)) {
        continuation.skipChapterIds.add(chapter.id);
      }
    }
    const continuedSchedule = continueScheduleAfterTime({
      baseSchedule: resolved,
      occupiedPlannedTime: continuation.occupiedPlannedTime,
      occupiedItemCount: continuation.occupiedCount,
    });
    let items;
    try {
      items = buildChapterPublishScheduleFromOffset({
        chapters: chapters.map((chapter) => ({
          ...chapter,
          volumeTitle: volumeTitleByChapterOrder.get(chapter.order) ?? null,
        })),
        schedule: continuedSchedule,
        skipChapterIds: continuation.skipChapterIds,
        startIndexOffset: resolveContinuationStartIndexOffset({
          schedule: continuedSchedule,
          occupiedPlannedTime: continuation.occupiedPlannedTime,
        }),
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (error instanceof Error && error.message === "没有可生成发布时间的章节。") {
        throw new AppError("当前章节已经存在本地发布进度，请继续使用现有计划或调整章节范围。", 400);
      }
      throw new AppError(
        error instanceof Error && error.message.trim() ? error.message : "发布时间表生成失败。",
        400,
      );
    }
    const mode = normalizeMode(request.mode);
    const defaultChapterCount = Math.max(
      0,
      chapters.length
      - getEffectiveRemoteProgressRows(remoteProgressSnapshot).publishedCount,
    );
    const chapterCount = typeof request.chapterCount === "number" && request.chapterCount > 0
      ? request.chapterCount
      : defaultChapterCount || undefined;
    const scopedItems = chapterCount ? items.slice(0, chapterCount) : items;
    if (scopedItems.length === 0) {
      throw new AppError("当前没有可纳入发布计划的章节。", 400);
    }

    const row = await prisma.$transaction(async (tx) => {
      await tx.publishPlan.updateMany({
        where: {
          novelId,
          binding: {
            credential: { userId },
          },
          status: { in: [PublishPlanStatus.draft, PublishPlanStatus.ready] },
        },
        data: {
          status: PublishPlanStatus.draft,
        },
      });
      return tx.publishPlan.create({
        data: {
          novelId,
          bindingId: binding.id,
          platform: PublishingPlatform.fanqie,
          mode,
          instruction,
          structuredScheduleJson: safeJsonStringify(structured),
          resolvedScheduleJson: safeJsonStringify(continuedSchedule),
          timezone: continuedSchedule.timezone,
          startChapterOrder: continuedSchedule.startChapterOrder,
          endChapterOrder: continuedSchedule.endChapterOrder,
          chaptersPerDay: continuedSchedule.chaptersPerDay,
          publishTimeOfDay: continuedSchedule.publishTime,
          status: PublishPlanStatus.ready,
          items: {
            create: scopedItems.map((item) => ({
              novelId,
              bindingId: binding.id,
              chapterId: item.chapterId,
              chapterOrder: item.chapterOrder,
              chapterTitle: item.chapterTitle,
              volumeTitle: item.volumeTitle,
              plannedPublishTime: item.plannedPublishTime,
              status: PublishItemStatus.unpublished,
            })),
          },
        },
        include: {
          items: {
            orderBy: [{ chapterOrder: "asc" }],
          },
        },
      });
    });

    return mapPublishPlan(row);
  }

  private async markJobFailure(input: {
    db: PrismaLike;
    jobId: string;
    itemIds: string[];
    error: unknown;
  }): Promise<void> {
    const itemStatus = resolveDispatchErrorItemStatus(
      input.error instanceof FanqieDispatchApiError ? input.error.payload : input.error,
    );
    const errorMessage = stringifyError(input.error);
    await input.db.publishDispatchJob.update({
      where: { id: input.jobId },
      data: {
        status: PublishDispatchJobStatus.failed,
        lastError: errorMessage,
        completedAt: new Date(),
      },
    });
    await input.db.publishPlanItem.updateMany({
      where: { id: { in: input.itemIds } },
      data: {
        status: itemStatus,
        dispatchStatus: PublishDispatchJobStatus.failed,
        lastError: errorMessage,
      },
    });
  }

  async submitPlan(novelId: string, planId: string, request: SubmitPublishPlanRequest) {
    const userId = requireCurrentUserId();
    await ensureNovel(novelId, userId);
    const plan = await prisma.publishPlan.findFirst({
      where: {
        id: planId,
        novelId,
        binding: {
          credential: { userId },
        },
      },
      include: {
        binding: {
          include: { credential: true },
        },
        items: {
          where: request.itemIds?.length ? { id: { in: request.itemIds } } : undefined,
          orderBy: [{ chapterOrder: "asc" }],
        },
      },
    });
    if (!plan) {
      throw new AppError("发布计划不存在。", 404);
    }
    if (plan.items.length === 0) {
      throw new AppError("没有可提交的章节。", 400);
    }

    const mode = normalizeMode(request.mode ?? plan.mode);
    const jobs = [];

    for (const item of plan.items) {
      const requestId = [
        "publish",
        plan.id,
        mode,
        item.plannedPublishTime.replace(/[-: ]/g, ""),
        item.id,
      ].join(":");
      const itemIds = [item.id];
      const chapters = await prisma.chapter.findMany({
        where: {
          novelId,
          id: item.chapterId,
        },
        select: {
          id: true,
          order: true,
          title: true,
          content: true,
        },
      });
      const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
      const chapter = chapterById.get(item.chapterId);
      const content = chapter?.content?.trim();
      if (!chapter || !content) {
        throw new AppError(`第 ${item.chapterOrder} 章没有正文，无法提交发布平台。`, 400);
      }
      const dispatchChapters = [{
        order: item.chapterOrder,
        title: item.chapterTitle,
        volumeTitle: item.volumeTitle,
        content,
      }];

      const localJob = await prisma.$transaction(async (tx) => {
        const job = await tx.publishDispatchJob.upsert({
          where: { requestId },
          create: {
            novelId,
            bindingId: plan.bindingId,
            credentialId: plan.binding.credentialId,
            planId: plan.id,
            requestId,
            platform: PublishingPlatform.fanqie,
            mode,
            plannedPublishTime: item.plannedPublishTime,
            status: PublishDispatchJobStatus.queued,
            credentialUuid: plan.binding.credential.credentialUuid,
            bookId: plan.binding.bookId,
            bookTitle: plan.binding.bookTitle,
            chapterCount: 1,
            payloadSummaryJson: safeJsonStringify({
              chapterOrders: [item.chapterOrder],
              chapterTitles: [item.chapterTitle],
            }),
          },
          update: {},
        });
        await tx.publishPlan.update({
          where: { id: plan.id },
          data: {
            status: PublishPlanStatus.submitting,
          },
        });
        await tx.publishPlanItem.updateMany({
          where: { id: { in: itemIds } },
          data: {
            status: PublishItemStatus.submitting,
            dispatchJobId: job.id,
            dispatchStatus: PublishDispatchJobStatus.queued,
            submittedAt: new Date(),
            lastError: null,
          },
        });
        return job;
      });

      try {
        const dispatchJob = await this.dispatchClient.createPublishJob({
          credentialUuid: plan.binding.credential.credentialUuid,
          bookId: plan.binding.bookId,
          bookTitle: plan.binding.bookTitle,
          mode,
          requestId,
          publishOptions: {
            useAi: request.useAi,
            timerTime: item.plannedPublishTime,
            dailyWordLimit: request.dailyWordLimit,
          },
          chapters: dispatchChapters,
        });
        const updated = await prisma.$transaction(async (tx) => {
          const job = await tx.publishDispatchJob.update({
            where: { id: localJob.id },
            data: {
              externalJobId: dispatchJob.id,
              status: dispatchJob.status,
              submittedAt: new Date(),
              completedAt: dispatchJob.status === "completed" || dispatchJob.status === "failed" ? new Date() : undefined,
              resultJson: dispatchJob.result ? safeJsonStringify(dispatchJob.result) : null,
              lastError: dispatchJob.lastError ? safeJsonStringify(dispatchJob.lastError) : null,
            },
          });
          const itemStatus = mapDispatchJobStatusToItemStatus({
            mode,
            dispatchStatus: dispatchJob.status,
            error: dispatchJob.lastError ?? dispatchJob.result,
          });
          await tx.publishPlanItem.updateMany({
            where: { id: { in: itemIds } },
            data: {
              status: itemStatus,
              externalJobId: dispatchJob.id,
              dispatchStatus: dispatchJob.status,
              publishedAt: dispatchJob.status === "completed" && mode === "publish" ? new Date() : undefined,
              lastError: dispatchJob.lastError ? safeJsonStringify(dispatchJob.lastError) : null,
            },
          });
          if (itemStatus === PublishItemStatus.relogin_required) {
            await tx.publishingPlatformCredential.update({
              where: { id: plan.binding.credentialId },
              data: { status: PublishingCredentialStatus.expired },
            });
          }
          return job;
        });
        jobs.push(updated);
      } catch (error) {
        await this.markJobFailure({
          db: prisma,
          jobId: localJob.id,
          itemIds,
          error,
        });
        if (error instanceof FanqieDispatchApiError && resolveDispatchErrorItemStatus(error.payload) === "relogin_required") {
          await prisma.publishingPlatformCredential.update({
            where: { id: plan.binding.credentialId },
            data: { status: PublishingCredentialStatus.expired },
          });
        }
        jobs.push(await prisma.publishDispatchJob.findUniqueOrThrow({ where: { id: localJob.id } }));
        break;
      }
    }

    await updatePlanStatusFromItems(prisma, plan.id);
    return jobs.map(mapPublishDispatchJob);
  }

  async submitPlanByBinding(bindingId: string, planId: string, request: SubmitPublishPlanRequest) {
    const userId = requireCurrentUserId();
    const binding = await prisma.novelPlatformBinding.findFirst({
      where: {
        id: bindingId,
        credential: { userId },
      },
      select: {
        id: true,
        novelId: true,
      },
    });
    if (!binding) {
      throw new AppError("小说发布绑定不存在。", 404);
    }
    return this.submitPlan(binding.novelId, planId, request);
  }

  async refreshJob(novelId: string, jobId: string) {
    const userId = requireCurrentUserId();
    await ensureNovel(novelId, userId);
    const localJob = await prisma.publishDispatchJob.findFirst({
      where: {
        id: jobId,
        novelId,
        binding: {
          credential: { userId },
        },
      },
      include: {
        items: true,
      },
    });
    if (!localJob) {
      throw new AppError("发布任务不存在。", 404);
    }
    if (!localJob.externalJobId) {
      return mapPublishDispatchJob(localJob);
    }

    const dispatchJob = await this.dispatchClient.getJob(localJob.externalJobId);
    const itemStatus = mapDispatchJobStatusToItemStatus({
      mode: localJob.mode,
      dispatchStatus: dispatchJob.status,
      error: dispatchJob.lastError ?? dispatchJob.result,
    });
    const updated = await prisma.$transaction(async (tx) => {
      const job = await tx.publishDispatchJob.update({
        where: { id: localJob.id },
        data: {
          status: dispatchJob.status,
          resultJson: dispatchJob.result ? safeJsonStringify(dispatchJob.result) : localJob.resultJson,
          lastError: dispatchJob.lastError ? safeJsonStringify(dispatchJob.lastError) : localJob.lastError,
          completedAt: dispatchJob.status === "completed" || dispatchJob.status === "failed" ? new Date() : localJob.completedAt,
        },
      });
      await tx.publishPlanItem.updateMany({
        where: { dispatchJobId: localJob.id },
        data: {
          status: itemStatus,
          dispatchStatus: dispatchJob.status,
          publishedAt: dispatchJob.status === "completed" && localJob.mode === "publish" ? new Date() : undefined,
          lastError: dispatchJob.lastError ? safeJsonStringify(dispatchJob.lastError) : null,
        },
      });
      if (itemStatus === PublishItemStatus.relogin_required) {
        await tx.publishingPlatformCredential.update({
          where: { id: localJob.credentialId },
          data: { status: PublishingCredentialStatus.expired },
        });
      }
      if (localJob.planId) {
        await updatePlanStatusFromItems(tx, localJob.planId);
      }
      return job;
    });

    return mapPublishDispatchJob(updated);
  }

  async refreshJobByBinding(bindingId: string, jobId: string) {
    const userId = requireCurrentUserId();
    const binding = await prisma.novelPlatformBinding.findFirst({
      where: {
        id: bindingId,
        credential: { userId },
      },
      select: {
        id: true,
        novelId: true,
      },
    });
    if (!binding) {
      throw new AppError("小说发布绑定不存在。", 404);
    }
    return this.refreshJob(binding.novelId, jobId);
  }
}

export const publishingService = new PublishingService();
