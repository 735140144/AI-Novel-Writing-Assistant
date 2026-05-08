import { serializeCommercialTagsJson } from "@ai-novel/shared/types/novelFraming";
import type { NovelAutoDirectorTaskSummary } from "@ai-novel/shared/types/novel";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { getRequestContext } from "../../runtime/requestContext";
import { mapNovelAutoDirectorTaskSummary } from "../task/novelWorkflowTaskSummary";
import { getArchivedTaskIdSet } from "../task/taskArchive";
import { NovelWorkflowService } from "./workflow/NovelWorkflowService";
import { NovelContinuationService } from "./NovelContinuationService";
import { STORY_WORLD_SLICE_SCHEMA_VERSION } from "./storyWorldSlice/storyWorldSlicePersistence";
import { syncChapterArtifacts } from "./novelChapterArtifacts";
import { listNovelTokenUsageByNovelIds } from "./novelTokenUsageSummary";
import {
  ChapterInput,
  CreateNovelInput,
  normalizeNovelOutput,
  normalizeOptionalTextForCreate,
  normalizeOptionalTextForUpdate,
  PaginationInput,
  parseContinuationBookAnalysisSections,
  serializeContinuationBookAnalysisSections,
  UpdateNovelInput,
} from "./novelCoreShared";
import { queueRagDelete, queueRagUpsert } from "./novelCoreSupport";

export class NovelCoreCrudService {
  private readonly novelContinuationService = new NovelContinuationService();
  private readonly workflowService = new NovelWorkflowService();

  private requireCurrentUserId(): string {
    const userId = getRequestContext()?.userId?.trim();
    if (!userId) {
      throw new AppError("未登录，请先登录。", 401);
    }
    return userId;
  }

  private getOwnedNovelScope():
    | { enforce: true; userId: string }
    | { enforce: false; userId: null } {
    const context = getRequestContext();
    const userId = context?.userId?.trim();
    if (context?.authMode === "session" && userId) {
      return { enforce: true, userId };
    }
    return { enforce: false, userId: null };
  }

  private buildOwnedNovelWhere(id: string) {
    const scope = this.getOwnedNovelScope();
    if (scope.enforce) {
      return { id, userId: scope.userId };
    }
    return { id };
  }

  private validateStoryModeSelection(primaryStoryModeId?: string | null, secondaryStoryModeId?: string | null): void {
    if (primaryStoryModeId && secondaryStoryModeId && primaryStoryModeId === secondaryStoryModeId) {
      throw new AppError("主流派模式和副流派模式不能选择同一项。", 400);
    }
  }

  private async validateCreativeResourceOwnership(input: {
    userId: string;
    genreId?: string | null;
    primaryStoryModeId?: string | null;
    secondaryStoryModeId?: string | null;
    worldId?: string | null;
  }): Promise<void> {
    const genreId = input.genreId?.trim() || null;
    const primaryStoryModeId = input.primaryStoryModeId?.trim() || null;
    const secondaryStoryModeId = input.secondaryStoryModeId?.trim() || null;

    if (genreId) {
      const genre = await prisma.novelGenre.findFirst({
        where: { id: genreId, userId: input.userId },
        select: { id: true },
      });
      if (!genre) {
        throw new AppError("指定的题材基底不存在。", 400);
      }
    }

    const storyModeIds = [primaryStoryModeId, secondaryStoryModeId].filter((value): value is string => Boolean(value));
    if (storyModeIds.length > 0) {
      const rows = await prisma.novelStoryMode.findMany({
        where: {
          userId: input.userId,
          id: { in: storyModeIds },
        },
        select: { id: true },
      });
      const ownedIds = new Set(rows.map((row) => row.id));
      if (primaryStoryModeId && !ownedIds.has(primaryStoryModeId)) {
        throw new AppError("指定的主推进模式不存在。", 400);
      }
      if (secondaryStoryModeId && !ownedIds.has(secondaryStoryModeId)) {
        throw new AppError("指定的副推进模式不存在。", 400);
      }
    }

    const worldId = input.worldId?.trim() || null;
    if (worldId) {
      const scope = this.getOwnedNovelScope();
      const world = await prisma.world.findFirst({
        where: scope.enforce
          ? {
            id: worldId,
            userId: input.userId,
          }
          : { id: worldId },
        select: { id: true },
      });
      if (!world) {
        throw new AppError("指定的世界观不存在。", 400);
      }
    }
  }

  async listNovels({ page, limit }: PaginationInput) {
    const scope = this.getOwnedNovelScope();
    const [items, total] = await Promise.all([
      prisma.novel.findMany({
        where: scope.enforce ? { userId: scope.userId } : undefined,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          description: true,
          targetAudience: true,
          bookSellingPoint: true,
          competingFeel: true,
          first30ChapterPromise: true,
          commercialTagsJson: true,
          status: true,
          writingMode: true,
          projectMode: true,
          narrativePov: true,
          pacePreference: true,
          styleTone: true,
          emotionIntensity: true,
          aiFreedom: true,
          defaultChapterLength: true,
          estimatedChapterCount: true,
          projectStatus: true,
          storylineStatus: true,
          outlineStatus: true,
          resourceReadyScore: true,
          sourceNovelId: true,
          sourceKnowledgeDocumentId: true,
          continuationBookAnalysisId: true,
          continuationBookAnalysisSections: true,
          genreId: true,
          primaryStoryModeId: true,
          secondaryStoryModeId: true,
          worldId: true,
          createdAt: true,
          updatedAt: true,
          genre: { select: { id: true, name: true } },
          world: { select: { id: true, name: true, worldType: true } },
          _count: { select: { chapters: true, characters: true, plotBeats: true } },
        },
      }),
      prisma.novel.count({
        where: scope.enforce ? { userId: scope.userId } : undefined,
      }),
    ]);

    const latestAutoDirectorTaskByNovelId = await this.listLatestVisibleAutoDirectorTasksByNovelIds(
      items.map((item) => item.id),
    );
    const tokenUsageByNovelId = await listNovelTokenUsageByNovelIds(items.map((item) => item.id));

    return {
      items: items.map((item) => ({
        ...normalizeNovelOutput(item),
        latestAutoDirectorTask: latestAutoDirectorTaskByNovelId.get(item.id) ?? null,
        tokenUsage: tokenUsageByNovelId.get(item.id) ?? null,
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private async listLatestVisibleAutoDirectorTasksByNovelIds(
    novelIds: string[],
  ): Promise<Map<string, NovelAutoDirectorTaskSummary>> {
    const uniqueNovelIds = Array.from(new Set(novelIds.filter((id) => id.trim().length > 0)));
    if (uniqueNovelIds.length === 0) {
      return new Map();
    }

    const rows = await prisma.novelWorkflowTask.findMany({
      where: {
        lane: "auto_director",
        novelId: {
          in: uniqueNovelIds,
        },
      },
      select: {
        id: true,
        novelId: true,
        lane: true,
        status: true,
        progress: true,
        currentStage: true,
        currentItemKey: true,
        currentItemLabel: true,
        checkpointType: true,
        checkpointSummary: true,
        resumeTargetJson: true,
        seedPayloadJson: true,
        lastError: true,
        heartbeatAt: true,
        finishedAt: true,
        milestonesJson: true,
        title: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });

    if (rows.length === 0) {
      return new Map();
    }

    const archivedTaskIds = await getArchivedTaskIdSet("novel_workflow", rows.map((row) => row.id));
    const taskByNovelId = new Map<string, NovelAutoDirectorTaskSummary>();
    for (const row of rows) {
      if (!row.novelId || archivedTaskIds.has(row.id) || taskByNovelId.has(row.novelId)) {
        continue;
      }
      taskByNovelId.set(row.novelId, mapNovelAutoDirectorTaskSummary(row));
    }
    return taskByNovelId;
  }

  async createNovel(input: CreateNovelInput) {
    const userId = this.requireCurrentUserId();
    const writingMode = input.writingMode ?? "original";
    const sourceNovelId = input.sourceNovelId ?? null;
    const sourceKnowledgeDocumentId = input.sourceKnowledgeDocumentId ?? null;
    const continuationBookAnalysisId = input.continuationBookAnalysisId ?? null;
    const normalizedContinuationBookAnalysisId =
      writingMode === "continuation" && (sourceNovelId || sourceKnowledgeDocumentId) ? continuationBookAnalysisId : null;
    const continuationBookAnalysisSections = serializeContinuationBookAnalysisSections(
      input.continuationBookAnalysisSections,
    );
    const commercialTagsJson = serializeCommercialTagsJson(input.commercialTags);
    this.validateStoryModeSelection(input.primaryStoryModeId, input.secondaryStoryModeId);
    await this.validateCreativeResourceOwnership({
      userId,
      genreId: input.genreId,
      primaryStoryModeId: input.primaryStoryModeId,
      secondaryStoryModeId: input.secondaryStoryModeId,
      worldId: input.worldId,
    });

    await this.novelContinuationService.validateWritingModeConfig({
      userId,
      writingMode,
      sourceNovelId,
      sourceKnowledgeDocumentId,
      continuationBookAnalysisId: normalizedContinuationBookAnalysisId,
    });

    const created = await prisma.novel.create({
      data: {
        userId: this.getOwnedNovelScope().enforce ? userId : null,
        title: input.title,
        description: input.description,
        targetAudience: normalizeOptionalTextForCreate(input.targetAudience),
        bookSellingPoint: normalizeOptionalTextForCreate(input.bookSellingPoint),
        competingFeel: normalizeOptionalTextForCreate(input.competingFeel),
        first30ChapterPromise: normalizeOptionalTextForCreate(input.first30ChapterPromise),
        commercialTagsJson,
        genreId: input.genreId,
        primaryStoryModeId: input.primaryStoryModeId ?? null,
        secondaryStoryModeId: input.secondaryStoryModeId ?? null,
        worldId: input.worldId,
        writingMode,
        projectMode: input.projectMode,
        narrativePov: input.narrativePov,
        pacePreference: input.pacePreference,
        styleTone: input.styleTone,
        emotionIntensity: input.emotionIntensity,
        aiFreedom: input.aiFreedom,
        defaultChapterLength: input.defaultChapterLength,
        estimatedChapterCount: input.estimatedChapterCount,
        projectStatus: input.projectStatus,
        storylineStatus: input.storylineStatus,
        outlineStatus: input.outlineStatus,
        resourceReadyScore: input.resourceReadyScore,
        sourceNovelId: writingMode === "continuation" ? sourceNovelId : null,
        sourceKnowledgeDocumentId: writingMode === "continuation" ? sourceKnowledgeDocumentId : null,
        continuationBookAnalysisId: normalizedContinuationBookAnalysisId,
        continuationBookAnalysisSections:
          writingMode === "continuation"
          && (sourceNovelId || sourceKnowledgeDocumentId)
          && normalizedContinuationBookAnalysisId
            ? continuationBookAnalysisSections
            : null,
      },
    });

    queueRagUpsert("novel", created.id);
    if (created.worldId) {
      queueRagUpsert("world", created.worldId);
    }
    return normalizeNovelOutput(created);
  }

  async getNovelById(id: string) {
    const row = await prisma.novel.findFirst({
      where: this.buildOwnedNovelWhere(id),
      include: {
        genre: true,
        primaryStoryMode: true,
        secondaryStoryMode: true,
        world: true,
        bible: true,
        bookContract: true,
        chapters: { orderBy: { order: "asc" }, include: { chapterSummary: true } },
        characters: { orderBy: { createdAt: "asc" } },
        plotBeats: { orderBy: [{ chapterOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!row) {
      return null;
    }
    return normalizeNovelOutput(row);
  }

  async updateNovel(id: string, input: UpdateNovelInput) {
    const userId = this.requireCurrentUserId();
    const existing = await prisma.novel.findFirst({
      where: this.buildOwnedNovelWhere(id),
      select: {
        id: true,
        userId: true,
        worldId: true,
        writingMode: true,
        sourceNovelId: true,
        sourceKnowledgeDocumentId: true,
        continuationBookAnalysisId: true,
        continuationBookAnalysisSections: true,
        primaryStoryModeId: true,
        secondaryStoryModeId: true,
      },
    });
    if (!existing) {
      throw new AppError("小说不存在。", 404);
    }

    const nextWritingMode = input.writingMode ?? (existing.writingMode === "continuation" ? "continuation" : "original");
    const nextSourceNovelId = input.sourceNovelId !== undefined ? input.sourceNovelId : existing.sourceNovelId;
    const nextSourceKnowledgeDocumentId = input.sourceKnowledgeDocumentId !== undefined
      ? input.sourceKnowledgeDocumentId
      : existing.sourceKnowledgeDocumentId;
    const nextContinuationBookAnalysisId = input.continuationBookAnalysisId !== undefined
      ? input.continuationBookAnalysisId
      : existing.continuationBookAnalysisId;
    const nextContinuationBookAnalysisSections = input.continuationBookAnalysisSections !== undefined
      ? input.continuationBookAnalysisSections
      : parseContinuationBookAnalysisSections(existing.continuationBookAnalysisSections);
    const nextPrimaryStoryModeId = input.primaryStoryModeId !== undefined
      ? input.primaryStoryModeId
      : existing.primaryStoryModeId;
    const nextSecondaryStoryModeId = input.secondaryStoryModeId !== undefined
      ? input.secondaryStoryModeId
      : existing.secondaryStoryModeId;
    const nextWorldId = input.worldId !== undefined ? input.worldId : existing.worldId;
    const normalizedNextContinuationBookAnalysisId =
      nextWritingMode === "continuation" && (nextSourceNovelId || nextSourceKnowledgeDocumentId)
        ? nextContinuationBookAnalysisId
        : null;
    this.validateStoryModeSelection(nextPrimaryStoryModeId, nextSecondaryStoryModeId);
    await this.validateCreativeResourceOwnership({
      userId,
      genreId: input.genreId !== undefined ? input.genreId : undefined,
      primaryStoryModeId: nextPrimaryStoryModeId,
      secondaryStoryModeId: nextSecondaryStoryModeId,
      worldId: nextWorldId,
    });

    await this.novelContinuationService.validateWritingModeConfig({
      novelId: id,
      userId,
      writingMode: nextWritingMode,
      sourceNovelId: nextSourceNovelId,
      sourceKnowledgeDocumentId: nextSourceKnowledgeDocumentId,
      continuationBookAnalysisId: normalizedNextContinuationBookAnalysisId,
    });

    const {
      continuationBookAnalysisSections: _ignoreSectionPatch,
      targetAudience: _ignoreTargetAudience,
      bookSellingPoint: _ignoreBookSellingPoint,
      competingFeel: _ignoreCompetingFeel,
      first30ChapterPromise: _ignoreFirst30ChapterPromise,
      commercialTags: _ignoreCommercialTags,
      ...restInput
    } = input;

    const serializedContinuationSections = serializeContinuationBookAnalysisSections(nextContinuationBookAnalysisSections);
    const commercialTagsJson = input.commercialTags !== undefined
      ? serializeCommercialTagsJson(input.commercialTags)
      : undefined;
    const shouldResetWorldSlice = nextWorldId !== existing.worldId;

    const updated = await prisma.novel.update({
      where: { id },
      data: {
        ...restInput,
        sourceNovelId: nextWritingMode === "continuation" ? nextSourceNovelId : null,
        sourceKnowledgeDocumentId: nextWritingMode === "continuation" ? nextSourceKnowledgeDocumentId : null,
        continuationBookAnalysisId: normalizedNextContinuationBookAnalysisId,
        primaryStoryModeId: nextPrimaryStoryModeId ?? null,
        secondaryStoryModeId: nextSecondaryStoryModeId ?? null,
        targetAudience: normalizeOptionalTextForUpdate(input.targetAudience),
        bookSellingPoint: normalizeOptionalTextForUpdate(input.bookSellingPoint),
        competingFeel: normalizeOptionalTextForUpdate(input.competingFeel),
        first30ChapterPromise: normalizeOptionalTextForUpdate(input.first30ChapterPromise),
        commercialTagsJson,
        continuationBookAnalysisSections:
          nextWritingMode === "continuation"
          && (nextSourceNovelId || nextSourceKnowledgeDocumentId)
          && normalizedNextContinuationBookAnalysisId
            ? serializedContinuationSections
            : null,
        ...(shouldResetWorldSlice
          ? {
            storyWorldSliceJson: null,
            storyWorldSliceOverridesJson: null,
            storyWorldSliceSchemaVersion: STORY_WORLD_SLICE_SCHEMA_VERSION,
          }
          : {}),
      },
      include: {
        primaryStoryMode: true,
        secondaryStoryMode: true,
      },
    });

    queueRagUpsert("novel", id);
    if (updated.worldId) {
      queueRagUpsert("world", updated.worldId);
    }
    return normalizeNovelOutput(updated);
  }

  async deleteNovel(id: string) {
    const scope = this.getOwnedNovelScope();
    const deleted = await prisma.novel.deleteMany({
      where: scope.enforce
        ? { id, userId: scope.userId }
        : { id },
    });
    if (deleted.count === 0) {
      throw new AppError("小说不存在。", 404);
    }
    queueRagDelete("novel", id);
    queueRagDelete("bible", id);
  }

  async listChapters(novelId: string) {
    return prisma.chapter.findMany({
      where: { novelId },
      orderBy: { order: "asc" },
      include: { chapterSummary: true },
    });
  }

  async createChapter(novelId: string, input: ChapterInput) {
    const chapter = await prisma.chapter.create({
      data: {
        novelId,
        title: input.title,
        order: input.order,
        content: input.content ?? "",
        expectation: input.expectation,
        chapterStatus: input.chapterStatus,
        targetWordCount: input.targetWordCount ?? null,
        conflictLevel: input.conflictLevel ?? null,
        revealLevel: input.revealLevel ?? null,
        mustAvoid: input.mustAvoid ?? null,
        taskSheet: input.taskSheet ?? null,
        sceneCards: input.sceneCards ?? null,
        repairHistory: input.repairHistory ?? null,
        qualityScore: input.qualityScore ?? null,
        continuityScore: input.continuityScore ?? null,
        characterScore: input.characterScore ?? null,
        pacingScore: input.pacingScore ?? null,
        riskFlags: input.riskFlags ?? null,
        generationState: "planned",
      },
    });

    if (chapter.content) {
      await syncChapterArtifacts(novelId, chapter.id, chapter.content);
    }
    queueRagUpsert("chapter", chapter.id);
    return chapter;
  }

  async updateChapter(novelId: string, chapterId: string, input: Partial<ChapterInput>) {
    const exists = await prisma.chapter.findFirst({ where: { id: chapterId, novelId }, select: { id: true } });
    if (!exists) {
      throw new Error("章节不存在");
    }

    const chapter = await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        title: input.title,
        order: input.order,
        content: input.content,
        expectation: input.expectation,
        chapterStatus: input.chapterStatus,
        targetWordCount: input.targetWordCount,
        conflictLevel: input.conflictLevel,
        revealLevel: input.revealLevel,
        mustAvoid: input.mustAvoid,
        taskSheet: input.taskSheet,
        sceneCards: input.sceneCards,
        repairHistory: input.repairHistory,
        qualityScore: input.qualityScore,
        continuityScore: input.continuityScore,
        characterScore: input.characterScore,
        pacingScore: input.pacingScore,
        riskFlags: input.riskFlags,
      },
    });

    if (typeof input.content === "string") {
      await syncChapterArtifacts(novelId, chapterId, input.content);
    }
    queueRagUpsert("chapter", chapterId);
    return chapter;
  }

  async deleteChapter(novelId: string, chapterId: string) {
    queueRagDelete("chapter", chapterId);
    queueRagDelete("chapter_summary", chapterId);
    const deleted = await prisma.chapter.deleteMany({ where: { id: chapterId, novelId } });
    if (deleted.count === 0) {
      throw new Error("章节不存在");
    }
  }
}
