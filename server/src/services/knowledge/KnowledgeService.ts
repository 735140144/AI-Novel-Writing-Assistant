import type {
  KnowledgeBindingTargetType,
  KnowledgeDocumentStatus,
  KnowledgeRecallTestResult,
} from "@ai-novel/shared/types/knowledge";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { getRequestContext } from "../../runtime/requestContext";
import { ragServices } from "../rag";
import {
  buildKnowledgeContentHash,
  normalizeKnowledgeContent,
  normalizeKnowledgeDocumentTitle,
} from "./common";

export class KnowledgeService {
  private requireCurrentUserId(): string {
    const userId = getRequestContext()?.userId?.trim();
    if (!userId) {
      throw new AppError("未登录，请先登录。", 401);
    }
    return userId;
  }

  private getOwnedKnowledgeScope():
    | { enforce: true; userId: string }
    | { enforce: false; userId: null } {
    const context = getRequestContext();
    const userId = context?.userId?.trim();
    if (context?.authMode === "session" && userId) {
      return { enforce: true, userId };
    }
    return { enforce: false, userId: null };
  }

  private buildOwnedKnowledgeWhere(documentId: string) {
    const scope = this.getOwnedKnowledgeScope();
    if (scope.enforce) {
      return { id: documentId, userId: scope.userId };
    }
    return { id: documentId };
  }

  private async loadLatestFailedIndexErrors(documentIds: string[]): Promise<Map<string, string | null>> {
    if (documentIds.length === 0) {
      return new Map();
    }

    const rows = await prisma.ragIndexJob.findMany({
      where: {
        ownerType: "knowledge_document",
        ownerId: { in: documentIds },
        status: "failed",
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        ownerId: true,
        lastError: true,
      },
    });

    const errorMap = new Map<string, string | null>();
    for (const row of rows) {
      if (!errorMap.has(row.ownerId)) {
        errorMap.set(row.ownerId, row.lastError ?? "索引任务失败。请到任务列表查看详情。");
      }
    }
    return errorMap;
  }

  private queueKnowledgeRebuild(documentId: string): void {
    void ragServices.ragIndexService.enqueueOwnerJob("rebuild", "knowledge_document", documentId).catch(() => {
      // Keep knowledge document CRUD resilient even if reindex queueing fails.
    });
  }

  private queueKnowledgeDelete(documentId: string): void {
    void ragServices.ragIndexService.enqueueOwnerJob("delete", "knowledge_document", documentId).catch(() => {
      // Keep knowledge document CRUD resilient even if delete queueing fails.
    });
  }

  private async assertTargetExists(targetType: KnowledgeBindingTargetType, targetId: string): Promise<void> {
    const scope = this.getOwnedKnowledgeScope();
    if (targetType === "novel") {
      const exists = await prisma.novel.count({
        where: scope.enforce ? { id: targetId, userId: scope.userId } : { id: targetId },
      });
      if (!exists) {
        throw new AppError("小说不存在。", 404);
      }
      return;
    }
    const exists = await prisma.world.count({
      where: scope.enforce ? { id: targetId, userId: scope.userId } : { id: targetId },
    });
    if (!exists) {
      throw new AppError("世界观不存在。", 404);
    }
  }

  async listDocuments(filters: {
    keyword?: string;
    status?: KnowledgeDocumentStatus;
  } = {}) {
    const scope = this.getOwnedKnowledgeScope();
    const keyword = filters.keyword?.trim();
    const rows = await prisma.knowledgeDocument.findMany({
      where: {
        ...(scope.enforce ? { userId: scope.userId } : {}),
        ...(filters.status ? { status: filters.status } : { status: { not: "archived" } }),
        ...(keyword
          ? {
            OR: [
              { title: { contains: keyword } },
              { fileName: { contains: keyword } },
            ],
          }
          : {}),
      },
      include: {
        _count: {
          select: {
            versions: true,
            bookAnalyses: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
    const failedIndexErrors = await this.loadLatestFailedIndexErrors(rows.map((item) => item.id));

    return rows.map((item) => ({
      id: item.id,
      title: item.title,
      fileName: item.fileName,
      status: item.status,
      activeVersionId: item.activeVersionId,
      activeVersionNumber: item.activeVersionNumber,
      latestIndexStatus: item.latestIndexStatus,
      latestIndexError:
        item.latestIndexStatus === "failed"
          ? (failedIndexErrors.get(item.id) ?? "索引任务失败。请到任务列表查看详情。")
          : null,
      lastIndexedAt: item.lastIndexedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      versionCount: item._count.versions,
      bookAnalysisCount: item._count.bookAnalyses,
    }));
  }

  async getDocumentById(documentId: string) {
    const document = await prisma.knowledgeDocument.findFirst({
      where: this.buildOwnedKnowledgeWhere(documentId),
      include: {
      versions: {
          orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
        },
        _count: {
          select: {
            bookAnalyses: true,
          },
        },
      },
    });
    if (!document) {
      return null;
    }
    const failedIndexError = document.latestIndexStatus === "failed"
      ? await prisma.ragIndexJob.findFirst({
        where: {
          ownerType: "knowledge_document",
          ownerId: document.id,
          status: "failed",
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: { lastError: true },
      })
      : null;

    return {
      id: document.id,
      title: document.title,
      fileName: document.fileName,
      status: document.status,
      activeVersionId: document.activeVersionId,
      activeVersionNumber: document.activeVersionNumber,
      latestIndexStatus: document.latestIndexStatus,
      latestIndexError:
        document.latestIndexStatus === "failed"
          ? (failedIndexError?.lastError ?? "索引任务失败。请到任务列表查看详情。")
          : null,
      lastIndexedAt: document.lastIndexedAt,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      bookAnalysisCount: document._count.bookAnalyses,
      versions: document.versions.map((version) => ({
        id: version.id,
        documentId: version.documentId,
        versionNumber: version.versionNumber,
        content: version.content,
        contentHash: version.contentHash,
        charCount: version.charCount,
        createdAt: version.createdAt,
        isActive: version.id === document.activeVersionId,
      })),
    };
  }

  async createDocument(input: {
    title?: string;
    fileName: string;
    content: string;
  }) {
    const userId = this.requireCurrentUserId();
    const scope = this.getOwnedKnowledgeScope();
    const normalizedContent = normalizeKnowledgeContent(input.content);
    const title = normalizeKnowledgeDocumentTitle(input.title, input.fileName);
    const contentHash = buildKnowledgeContentHash(normalizedContent);

    const document = await prisma.$transaction(async (tx) => {
      const existing = await tx.knowledgeDocument.findFirst({
        where: {
          ...(scope.enforce ? { userId: scope.userId } : {}),
          title,
          status: { not: "archived" },
        },
        orderBy: { updatedAt: "desc" },
      });

      if (existing) {
        const nextVersionNumber = existing.activeVersionNumber + 1;
        const version = await tx.knowledgeDocumentVersion.create({
          data: {
            documentId: existing.id,
            versionNumber: nextVersionNumber,
            content: normalizedContent,
            contentHash,
            charCount: normalizedContent.length,
          },
        });
        return tx.knowledgeDocument.update({
          where: { id: existing.id },
          data: {
            fileName: input.fileName.trim(),
            activeVersionId: version.id,
            activeVersionNumber: nextVersionNumber,
            latestIndexStatus: "queued",
          },
          include: {
            versions: {
              orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
            },
          },
        });
      }

      const created = await tx.knowledgeDocument.create({
        data: {
          userId: scope.enforce ? userId : null,
          title,
          fileName: input.fileName.trim(),
          status: "enabled",
          latestIndexStatus: "queued",
        },
      });
      const version = await tx.knowledgeDocumentVersion.create({
        data: {
          documentId: created.id,
          versionNumber: 1,
          content: normalizedContent,
          contentHash,
          charCount: normalizedContent.length,
        },
      });
      return tx.knowledgeDocument.update({
        where: { id: created.id },
        data: {
          activeVersionId: version.id,
          activeVersionNumber: 1,
        },
        include: {
          versions: {
            orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
          },
        },
      });
    });

    this.queueKnowledgeRebuild(document.id);
    const detail = await this.getDocumentById(document.id);
    if (!detail) {
      throw new Error("Knowledge document not found after creation.");
    }
    return detail;
  }

  async createDocumentVersion(documentId: string, input: {
    fileName?: string;
    content: string;
  }) {
    const scope = this.getOwnedKnowledgeScope();
    const normalizedContent = normalizeKnowledgeContent(input.content);
    const contentHash = buildKnowledgeContentHash(normalizedContent);

    const document = await prisma.$transaction(async (tx) => {
      const existing = await tx.knowledgeDocument.findUnique({
        where: { id: documentId },
      });
      if (!existing || (scope.enforce && existing.userId !== scope.userId)) {
        throw new AppError("知识库文档不存在。", 404);
      }
      if (existing.status === "archived") {
        throw new AppError("归档知识库文档不能新增版本。", 400);
      }
      const nextVersionNumber = existing.activeVersionNumber + 1;
      const version = await tx.knowledgeDocumentVersion.create({
        data: {
          documentId,
          versionNumber: nextVersionNumber,
          content: normalizedContent,
          contentHash,
          charCount: normalizedContent.length,
        },
      });
      return tx.knowledgeDocument.update({
        where: { id: documentId },
        data: {
          fileName: input.fileName?.trim() || existing.fileName,
          activeVersionId: version.id,
          activeVersionNumber: nextVersionNumber,
          latestIndexStatus: "queued",
        },
        include: {
          versions: {
            orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
          },
        },
      });
    });

    this.queueKnowledgeRebuild(document.id);
    const detail = await this.getDocumentById(document.id);
    if (!detail) {
      throw new Error("Knowledge document not found after version creation.");
    }
    return detail;
  }

  async activateVersion(documentId: string, versionId: string) {
    const scope = this.getOwnedKnowledgeScope();
    const document = await prisma.$transaction(async (tx) => {
      const existing = await tx.knowledgeDocument.findUnique({
        where: { id: documentId },
        select: { id: true, userId: true },
      });
      if (!existing || (scope.enforce && existing.userId !== scope.userId)) {
        throw new AppError("知识库文档不存在。", 404);
      }
      const version = await tx.knowledgeDocumentVersion.findFirst({
        where: {
          id: versionId,
          documentId,
        },
      });
      if (!version) {
        throw new AppError("知识库文档版本不存在。", 404);
      }
      return tx.knowledgeDocument.update({
        where: { id: documentId },
        data: {
          activeVersionId: version.id,
          activeVersionNumber: version.versionNumber,
          latestIndexStatus: "queued",
        },
        include: {
          versions: {
            orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
          },
        },
      });
    });

    this.queueKnowledgeRebuild(document.id);
    const detail = await this.getDocumentById(document.id);
    if (!detail) {
      throw new Error("Knowledge document not found after version activation.");
    }
    return detail;
  }

  async reindexDocument(documentId: string) {
    const document = await prisma.knowledgeDocument.findFirst({
      where: this.buildOwnedKnowledgeWhere(documentId),
    });
    if (!document) {
      throw new AppError("知识库文档不存在。", 404);
    }
    if (!document.activeVersionId) {
      throw new AppError("知识库文档没有活动版本。", 400);
    }
    const updated = await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: {
        latestIndexStatus: "queued",
      },
    });
    this.queueKnowledgeRebuild(documentId);
    return updated;
  }

  async updateDocumentStatus(documentId: string, status: KnowledgeDocumentStatus) {
    const document = await prisma.knowledgeDocument.findFirst({
      where: this.buildOwnedKnowledgeWhere(documentId),
    });
    if (!document) {
      throw new AppError("知识库文档不存在。", 404);
    }
    const updated = await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: {
        status,
        ...(status === "archived" ? { latestIndexStatus: "idle" } : {}),
      },
    });
    if (status === "archived") {
      this.queueKnowledgeDelete(documentId);
    }
    return updated;
  }

  async testDocumentRecall(documentId: string, query: string, limit = 6): Promise<KnowledgeRecallTestResult> {
    const document = await prisma.knowledgeDocument.findFirst({
      where: this.buildOwnedKnowledgeWhere(documentId),
    });
    if (!document) {
      throw new AppError("知识库文档不存在。", 404);
    }
    if (document.status === "archived") {
      throw new AppError("归档知识库文档不能进行召回测试。", 400);
    }
    if (document.latestIndexStatus !== "succeeded") {
      throw new AppError("知识库文档索引成功后才能进行召回测试。", 400);
    }

    const hits = await ragServices.hybridRetrievalService.retrieve(query, {
      ownerTypes: ["knowledge_document"],
      knowledgeDocumentIds: [documentId],
      finalTopK: limit,
      vectorCandidates: Math.max(limit * 2, 10),
      keywordCandidates: Math.max(limit * 2, 10),
    });

    return {
      documentId,
      query,
      hits: hits.map((item) => ({
        id: item.id,
        ownerId: item.ownerId,
        score: item.score,
        source: item.source,
        title: item.title,
        chunkText: item.chunkText,
        chunkOrder: item.chunkOrder,
      })),
    };
  }

  async listBindings(targetType: KnowledgeBindingTargetType, targetId: string) {
    await this.assertTargetExists(targetType, targetId);
    const scope = this.getOwnedKnowledgeScope();
    const bindings = await prisma.knowledgeBinding.findMany({
      where: {
        targetType,
        targetId,
        ...(scope.enforce ? { document: { userId: scope.userId } } : {}),
      },
      include: {
        document: {
          include: {
            _count: {
              select: { versions: true },
            },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }],
    });
    return bindings.map((item) => ({
      ...item.document,
      versionCount: item.document._count.versions,
    }));
  }

  async replaceBindings(
    targetType: KnowledgeBindingTargetType,
    targetId: string,
    documentIds: string[],
  ) {
    await this.assertTargetExists(targetType, targetId);
    const uniqueDocumentIds = Array.from(new Set(documentIds.map((item) => item.trim()).filter(Boolean)));
    if (uniqueDocumentIds.length > 0) {
      const scope = this.getOwnedKnowledgeScope();
      const documents = await prisma.knowledgeDocument.findMany({
        where: {
          ...(scope.enforce ? { userId: scope.userId } : {}),
          id: { in: uniqueDocumentIds },
          status: { not: "archived" },
        },
        select: { id: true },
      });
      if (documents.length !== uniqueDocumentIds.length) {
        throw new AppError("指定的知识库文档不存在。", 400);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.knowledgeBinding.deleteMany({
        where: {
          targetType,
          targetId,
        },
      });
      if (uniqueDocumentIds.length > 0) {
        await tx.knowledgeBinding.createMany({
          data: uniqueDocumentIds.map((documentId) => ({
            targetType,
            targetId,
            documentId,
          })),
        });
      }
    });

    return this.listBindings(targetType, targetId);
  }
}
