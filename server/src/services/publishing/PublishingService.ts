import type {
  GeneratePublishPlanRequest,
  PublishMode,
  SubmitPublishPlanRequest,
  UpsertNovelPlatformBindingRequest,
} from "@ai-novel/shared/types/publishing";
import {
  NovelPlatformBindingStatus,
  Prisma,
  PublishDispatchJobStatus,
  PublishItemStatus,
  PublishPlanStatus,
  PublishingCredentialStatus,
  PublishingPlatform,
} from "@prisma/client";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { publishingSchedulePrompt } from "../../prompting/prompts/publishing/publishingSchedule.prompts";
import { getRequestContext } from "../../runtime/requestContext";
import { FanqieDispatchApiError, FanqieDispatchClient, type FanqieDispatchChallenge } from "./FanqieDispatchClient";
import {
  buildChapterPublishSchedule,
  getNextDateStringInTimeZone,
  groupPublishPlanItemsByPlannedTime,
  normalizeStructuredSchedule,
} from "./publishingSchedule";
import { mapDispatchJobStatusToItemStatus, resolveDispatchErrorItemStatus } from "./publishingStatus";
import {
  mapCredentialLoginResponse,
  mapNovelPlatformBinding,
  mapPublishDispatchJob,
  mapPublishingCredential,
  mapPublishPlan,
} from "./publishingMappers";

type PublishingTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type PrismaLike = typeof prisma | PublishingTransaction;

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "JSON 序列化失败。" });
  }
}

function stringifyError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return "发布平台请求失败。";
}

function sanitizeChallengeForClient(challenge: FanqieDispatchChallenge | null): FanqieDispatchChallenge | null {
  if (!challenge) {
    return null;
  }
  const { qrPageUrl: _qrPageUrl, qrImageUrl: _qrImageUrl, ...safeChallenge } = challenge;
  return safeChallenge;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizePlatform(value: string | undefined | null): PublishingPlatform {
  if (!value || value === "fanqie") {
    return PublishingPlatform.fanqie;
  }
  throw new AppError("当前仅支持番茄平台。", 400);
}

function normalizeMode(value: string | undefined | null): PublishMode {
  return value === "publish" ? "publish" : "draft";
}

function normalizeOptionalPositiveInt(value: number | undefined, max: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(1, Math.min(max, Math.floor(value)));
}

function resolvePlanStatusFromItemStatuses(statuses: PublishItemStatus[]): PublishPlanStatus {
  if (statuses.length === 0) {
    return PublishPlanStatus.draft;
  }
  if (statuses.some((status) => status === PublishItemStatus.submitting)) {
    return PublishPlanStatus.submitting;
  }
  if (statuses.every((status) => status === PublishItemStatus.draft_box || status === PublishItemStatus.published)) {
    return PublishPlanStatus.completed;
  }
  if (statuses.some((status) => status === PublishItemStatus.failed || status === PublishItemStatus.relogin_required)) {
    return PublishPlanStatus.failed;
  }
  return PublishPlanStatus.ready;
}

export class PublishingService {
  constructor(private readonly dispatchClient = new FanqieDispatchClient()) {}

  private requireCurrentUserId(): string {
    const userId = getRequestContext()?.userId?.trim();
    if (!userId) {
      throw new AppError("未登录，请先登录。", 401);
    }
    return userId;
  }

  private buildOwnedNovelWhere(novelId: string, userId: string) {
    if (getRequestContext()?.authMode === "session") {
      return { id: novelId, userId };
    }
    return { id: novelId };
  }

  private async ensureNovel(novelId: string, userId: string) {
    const novel = await prisma.novel.findFirst({
      where: this.buildOwnedNovelWhere(novelId, userId),
      select: { id: true, title: true, userId: true },
    });
    if (!novel) {
      throw new AppError("小说不存在。", 404);
    }
    return novel;
  }

  private async getOwnedCredential(credentialId: string, userId: string, db: PrismaLike = prisma) {
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

  private async getOwnedBinding(novelId: string, bindingId: string, userId: string, db: PrismaLike = prisma) {
    await this.ensureNovel(novelId, userId);
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

  private async getActiveBinding(novelId: string, userId: string, db: PrismaLike = prisma) {
    await this.ensureNovel(novelId, userId);
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

  private async listVolumeTitlesByChapterOrder(novelId: string): Promise<Map<number, string>> {
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

  private async updatePlanStatusFromItems(db: PrismaLike, planId: string): Promise<void> {
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

  private async upsertCredentialFromDispatch(input: {
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

  async listCredentials() {
    const userId = this.requireCurrentUserId();
    const rows = await prisma.publishingPlatformCredential.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(mapPublishingCredential);
  }

  async createCredential(input: {
    platform?: string;
    label: string;
    credentialUuid?: string;
  }) {
    const userId = this.requireCurrentUserId();
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
    const row = await this.upsertCredentialFromDispatch({
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
    const userId = this.requireCurrentUserId();
    const credential = await this.getOwnedCredential(credentialId, userId);
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
    const userId = this.requireCurrentUserId();
    const credential = await this.getOwnedCredential(credentialId, userId);
    const response = await this.dispatchClient.validateCredential({
      credentialUuid: credential.credentialUuid,
      challengeId: (challengeId?.trim() || credential.lastLoginChallengeId) ?? undefined,
    });
    const challenge = sanitizeChallengeForClient(response.challenge);

    const updated = await prisma.publishingPlatformCredential.update({
      where: { id: credential.id },
      data: {
        status: response.credential.status,
        accountId: response.credential.account?.accountId ?? null,
        accountDisplayName: response.credential.account?.accountDisplayName ?? null,
        lastValidatedAt: new Date(),
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

  async upsertNovelBinding(novelId: string, input: UpsertNovelPlatformBindingRequest) {
    const userId = this.requireCurrentUserId();
    await this.ensureNovel(novelId, userId);
    const platform = normalizePlatform(input.platform);
    const credential = await this.getOwnedCredential(input.credentialId, userId);
    const bookId = input.bookId.trim();
    const bookTitle = input.bookTitle.trim();
    if (!bookId || !bookTitle) {
      throw new AppError("请填写平台书籍 ID 和书名。", 400);
    }

    const row = await prisma.novelPlatformBinding.upsert({
      where: {
        novelId_platform: {
          novelId,
          platform,
        },
      },
      create: {
        novelId,
        platform,
        credentialId: credential.id,
        bookId,
        bookTitle,
        status: NovelPlatformBindingStatus.active,
      },
      update: {
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
          },
        },
      },
    });

    return mapNovelPlatformBinding(row);
  }

  async getWorkspace(novelId: string) {
    const userId = this.requireCurrentUserId();
    await this.ensureNovel(novelId, userId);
    const [credentials, binding, activePlan, recentJobs] = await Promise.all([
      prisma.publishingPlatformCredential.findMany({
        where: { userId },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
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
      binding: binding ? mapNovelPlatformBinding(binding) : null,
      activePlan: activePlan ? mapPublishPlan(activePlan) : null,
      recentJobs: recentJobs.map(mapPublishDispatchJob),
    };
  }

  private async parseScheduleInstruction(input: {
    novelId: string;
    instruction: string;
    chapters: Array<{ order: number }>;
    request: GeneratePublishPlanRequest;
  }) {
    const minChapterOrder = Math.min(...input.chapters.map((chapter) => chapter.order));
    const maxChapterOrder = Math.max(...input.chapters.map((chapter) => chapter.order));
    const timezone = "Asia/Shanghai";
    const defaultStartDate = getNextDateStringInTimeZone(new Date(), timezone);
    const todayDate = getNextDateStringInTimeZone(
      new Date(Date.now() - 24 * 60 * 60 * 1000),
      timezone,
    );
    const result = await runStructuredPrompt({
      asset: publishingSchedulePrompt,
      promptInput: {
        instruction: input.instruction,
        todayDate,
        defaultStartDate,
        minChapterOrder,
        maxChapterOrder,
        timezone,
      },
      options: {
        provider: input.request.provider,
        model: input.request.model,
        temperature: input.request.temperature,
        novelId: input.novelId,
        stage: "publishing_schedule",
        entrypoint: "novel_publishing_workspace",
      },
    });

    const structured = {
      ...result.output,
      startChapterOrder: normalizeOptionalPositiveInt(input.request.startChapterOrder, 2000)
        ?? result.output.startChapterOrder,
      endChapterOrder: normalizeOptionalPositiveInt(input.request.endChapterOrder, 2000)
        ?? result.output.endChapterOrder,
    };

    return {
      structured,
      resolved: normalizeStructuredSchedule({
        structured,
        defaultStartDate,
        minChapterOrder,
        maxChapterOrder,
        timezone,
      }),
    };
  }

  async generatePlan(novelId: string, request: GeneratePublishPlanRequest) {
    const userId = this.requireCurrentUserId();
    await this.ensureNovel(novelId, userId);
    const binding = request.bindingId
      ? await this.getOwnedBinding(novelId, request.bindingId, userId)
      : await this.getActiveBinding(novelId, userId);
    const instruction = request.instruction.trim();
    if (!instruction) {
      throw new AppError("请填写发布节奏。", 400);
    }

    const [chapters, volumeTitleByChapterOrder] = await Promise.all([
      prisma.chapter.findMany({
        where: { novelId },
        select: {
          id: true,
          order: true,
          title: true,
        },
        orderBy: [{ order: "asc" }],
      }),
      this.listVolumeTitlesByChapterOrder(novelId),
    ]);
    if (chapters.length === 0) {
      throw new AppError("当前小说还没有可发布章节。", 400);
    }

    const { structured, resolved } = await this.parseScheduleInstruction({
      novelId,
      instruction,
      chapters,
      request,
    });
    const items = buildChapterPublishSchedule({
      chapters: chapters.map((chapter) => ({
        ...chapter,
        volumeTitle: volumeTitleByChapterOrder.get(chapter.order) ?? null,
      })),
      schedule: resolved,
    });
    const mode = normalizeMode(request.mode);

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
          resolvedScheduleJson: safeJsonStringify(resolved),
          timezone: resolved.timezone,
          startChapterOrder: resolved.startChapterOrder,
          endChapterOrder: resolved.endChapterOrder,
          chaptersPerDay: resolved.chaptersPerDay,
          publishTimeOfDay: resolved.publishTime,
          status: PublishPlanStatus.ready,
          items: {
            create: items.map((item) => ({
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
    const userId = this.requireCurrentUserId();
    await this.ensureNovel(novelId, userId);
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
    const groups = groupPublishPlanItemsByPlannedTime(plan.items);
    const jobs = [];

    for (const group of groups) {
      const requestId = [
        "publish",
        plan.id,
        mode,
        group.plannedPublishTime.replace(/[-: ]/g, ""),
        group.items.map((item) => item.id).sort().join("_"),
      ].join(":");
      const itemIds = group.items.map((item) => item.id);
      const chapters = await prisma.chapter.findMany({
        where: {
          novelId,
          id: { in: group.items.map((item) => item.chapterId) },
        },
        select: {
          id: true,
          order: true,
          title: true,
          content: true,
        },
      });
      const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
      const dispatchChapters = group.items.map((item) => {
        const chapter = chapterById.get(item.chapterId);
        const content = chapter?.content?.trim();
        if (!chapter || !content) {
          throw new AppError(`第 ${item.chapterOrder} 章没有正文，无法提交发布平台。`, 400);
        }
        return {
          order: item.chapterOrder,
          title: item.chapterTitle,
          volumeTitle: item.volumeTitle,
          content,
        };
      });

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
            plannedPublishTime: group.plannedPublishTime,
            status: PublishDispatchJobStatus.queued,
            credentialUuid: plan.binding.credential.credentialUuid,
            bookId: plan.binding.bookId,
            bookTitle: plan.binding.bookTitle,
            chapterCount: group.items.length,
            payloadSummaryJson: safeJsonStringify({
              chapterOrders: group.items.map((item) => item.chapterOrder),
              chapterTitles: group.items.map((item) => item.chapterTitle),
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
            timerTime: group.plannedPublishTime,
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
      }
    }

    await this.updatePlanStatusFromItems(prisma, plan.id);
    return jobs.map(mapPublishDispatchJob);
  }

  async refreshJob(novelId: string, jobId: string) {
    const userId = this.requireCurrentUserId();
    await this.ensureNovel(novelId, userId);
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
        await this.updatePlanStatusFromItems(tx, localJob.planId);
      }
      return job;
    });

    return mapPublishDispatchJob(updated);
  }
}

export const publishingService = new PublishingService();
