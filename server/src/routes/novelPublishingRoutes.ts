import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { llmProviderSchema } from "../llm/providerSchema";
import { validate } from "../middleware/validate";
import { publishingService } from "../services/publishing/PublishingService";

const credentialIdParamsSchema = z.object({
  credentialId: z.string().trim().min(1),
});

const publishingBindingParamsSchema = z.object({
  bindingId: z.string().trim().min(1),
});

const publishingJobParamsSchema = z.object({
  jobId: z.string().trim().min(1),
});

const publishingJobRefreshParamsSchema = publishingBindingParamsSchema.merge(publishingJobParamsSchema);

const publishPlanParamsSchema = z.object({
  bindingId: z.string().trim().min(1),
  planId: z.string().trim().min(1),
});

const createCredentialSchema = z.object({
  platform: z.enum(["fanqie"]).optional(),
  label: z.string().trim().min(1).max(80),
  credentialUuid: z.string().trim().min(1).optional(),
});

const bootstrapCredentialLoginSchema = z.object({
  mode: z.enum(["create", "refresh"]).optional(),
});

const validateCredentialSchema = z.object({
  challengeId: z.string().trim().min(1).optional(),
});

const upsertBindingSchema = z.object({
  platform: z.enum(["fanqie"]).optional(),
  credentialId: z.string().trim().min(1),
  bookId: z.string().trim().min(1).max(80),
  bookTitle: z.string().trim().min(1).max(120),
});

const generatePlanSchema = z.object({
  instruction: z.string().trim().min(1).max(1000),
  chapterCount: z.number().int().min(1).max(2000).optional(),
  mode: z.enum(["draft", "publish"]).optional(),
  startChapterOrder: z.number().int().min(1).max(2000).optional(),
  endChapterOrder: z.number().int().min(1).max(2000).optional(),
  provider: llmProviderSchema.optional(),
  model: z.string().trim().max(120).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const submitPlanSchema = z.object({
  mode: z.enum(["draft", "publish"]).optional(),
  itemIds: z.array(z.string().trim().min(1)).max(500).optional(),
  useAi: z.boolean().optional(),
  dailyWordLimit: z.number().int().min(1000).max(200000).optional(),
});

interface RegisterNovelPublishingRoutesInput {
  router: Router;
  idParamsSchema: z.ZodType<{ id: string }>;
}

export function registerNovelPublishingRoutes(input: RegisterNovelPublishingRoutesInput): void {
  const { router, idParamsSchema } = input;

  router.get("/publishing/credentials", async (_req, res, next) => {
    try {
      const data = await publishingService.listCredentials();
      res.status(200).json({
        success: true,
        data,
        message: "发布账号列表加载完成。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/publishing/credentials", validate({ body: createCredentialSchema }), async (req, res, next) => {
    try {
      const data = await publishingService.createCredential(req.body as z.infer<typeof createCredentialSchema>);
      res.status(201).json({
        success: true,
        data,
        message: "请扫码登录番茄。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/publishing/credentials/:credentialId/login-bootstrap",
    validate({ params: credentialIdParamsSchema, body: bootstrapCredentialLoginSchema }),
    async (req, res, next) => {
      try {
        const { credentialId } = req.params as z.infer<typeof credentialIdParamsSchema>;
        const body = req.body as z.infer<typeof bootstrapCredentialLoginSchema>;
        const data = await publishingService.bootstrapCredentialLogin(credentialId, body.mode);
        res.status(200).json({
          success: true,
          data,
          message: "请用番茄作者账号扫码。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/publishing/credentials/:credentialId/validate",
    validate({ params: credentialIdParamsSchema, body: validateCredentialSchema }),
    async (req, res, next) => {
      try {
        const { credentialId } = req.params as z.infer<typeof credentialIdParamsSchema>;
        const body = req.body as z.infer<typeof validateCredentialSchema>;
        const data = await publishingService.validateCredential(credentialId, body.challengeId);
        res.status(200).json({
          success: true,
          data,
          message: "发布账号状态刷新完成。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/:id/publishing/workspace", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await publishingService.getWorkspace(id);
      res.status(200).json({
        success: true,
        data,
        message: "发布工作区加载完成。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.get("/publishing/works", async (_req, res, next) => {
    try {
      const data = await publishingService.listWorks();
      res.status(200).json({
        success: true,
        data,
        message: "发布作品列表加载完成。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:id/publishing/bindings",
    validate({ params: idParamsSchema, body: upsertBindingSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await publishingService.upsertNovelBinding(
          id,
          req.body as z.infer<typeof upsertBindingSchema>,
        );
        res.status(201).json({
          success: true,
          data,
          message: "番茄书籍绑定可用于生成发布时间表。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/publishing/works/:bindingId",
    validate({ params: publishingBindingParamsSchema }),
    async (req, res, next) => {
      try {
        const { bindingId } = req.params as z.infer<typeof publishingBindingParamsSchema>;
        const data = await publishingService.getWorkDetail(bindingId);
        res.status(200).json({
          success: true,
          data,
          message: "发布详情加载完成。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/publishing/works/:bindingId/progress/sync",
    validate({ params: publishingBindingParamsSchema }),
    async (req, res, next) => {
      try {
        const { bindingId } = req.params as z.infer<typeof publishingBindingParamsSchema>;
        const data = await publishingService.syncBindingProgress(bindingId);
        res.status(200).json({
          success: true,
          data,
          message: "远端发布进度同步完成。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/publishing/works/:bindingId/plans",
    validate({ params: publishingBindingParamsSchema, body: generatePlanSchema }),
    async (req, res, next) => {
      try {
        const { bindingId } = req.params as z.infer<typeof publishingBindingParamsSchema>;
        const body = req.body as z.infer<typeof generatePlanSchema>;
        const data = await publishingService.generatePlanForBinding(bindingId, body);
        res.status(201).json({
          success: true,
          data,
          message: "发布时间表可用于提交章节。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/publishing/works/:bindingId/plans/:planId/submit",
    validate({ params: publishPlanParamsSchema, body: submitPlanSchema }),
    async (req, res, next) => {
      try {
        const { bindingId, planId } = req.params as z.infer<typeof publishPlanParamsSchema>;
        const data = await publishingService.submitPlanByBinding(bindingId, planId, req.body as z.infer<typeof submitPlanSchema>);
        res.status(202).json({
          success: true,
          data,
          message: "章节正在提交发布平台。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    "/publishing/works/:bindingId/plans/:planId",
    validate({ params: publishPlanParamsSchema }),
    async (req, res, next) => {
      try {
        const { bindingId, planId } = req.params as z.infer<typeof publishPlanParamsSchema>;
        const data = await publishingService.deletePlanByBinding(bindingId, planId);
        res.status(200).json({
          success: true,
          data,
          message: "当前本地发布时间表已清除。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/publishing/works/:bindingId/jobs/:jobId/refresh",
    validate({ params: publishingJobRefreshParamsSchema }),
    async (req, res, next) => {
      try {
        const { bindingId, jobId } = req.params as z.infer<typeof publishingJobRefreshParamsSchema>;
        const data = await publishingService.refreshJobByBinding(bindingId, jobId);
        res.status(200).json({
          success: true,
          data,
          message: "发布任务状态刷新完成。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
}
